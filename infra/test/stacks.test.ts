// The CDK stacks, checked before anything reaches AWS (synthesized templates, no credentials).
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AuthStack } from '../src/auth';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { BetaStack } from '../src/beta';
import { BudgetsStack } from '../src/budgets';
import { CertStack } from '../src/cert';
import { DataStack } from '../src/data';
import { LoadStack } from '../src/load';
import { loadConfig } from '../src/config';
import { EmailStack } from '../src/email';

const config = loadConfig({
  WR_ALERT_EMAIL: 'alerts@example.com',
  WR_SENDER_EMAIL: 'sender@example.com',
  WR_TEST_RECIPIENTS: 'sender@example.com, friend@example.com',
  WR_COGNITO_DOMAIN_PREFIX: 'writers-room-test',
});
const env = { region: 'us-east-2' };

describe('budget alarms (SPEC 5.5)', () => {
  it('a $40 monthly budget that emails at $20 and $40 actual, and $40 forecast', () => {
    const t = Template.fromStack(
      new BudgetsStack(new App(), 'B', { env, alertEmail: 'alerts@example.com' }),
    );
    t.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 40, Unit: 'USD' }, TimeUnit: 'MONTHLY', BudgetType: 'COST' },
      NotificationsWithSubscribers: [
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'ACTUAL', Threshold: 50 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'ACTUAL', Threshold: 100 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'FORECASTED', Threshold: 100 }),
        }),
      ],
    });
    expect(JSON.stringify(t.toJSON())).toContain('alerts@example.com');
  });
});

describe('SES identities (D-038)', () => {
  it('one identity per address, the sender counted once', () => {
    const t = Template.fromStack(
      new EmailStack(new App(), 'E', {
        env,
        senderEmail: config.senderEmail,
        testRecipients: config.testRecipients,
      }),
    );
    t.resourceCountIs('AWS::SES::EmailIdentity', 2);
  });
});

describe('Cognito (D-030, D-031, D-044)', () => {
  const t = Template.fromStack(new AuthStack(new App(), 'A', { env, config }));

  it('Essentials, passwordless email codes, email as a case-insensitive username', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'ESSENTIALS',
      UsernameAttributes: ['email'],
      UsernameConfiguration: { CaseSensitive: false },
      Policies: Match.objectLike({
        SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(['EMAIL_OTP']) },
      }),
      EmailConfiguration: Match.objectLike({ EmailSendingAccount: 'DEVELOPER' }),
      VerificationMessageTemplate: Match.objectLike({
        EmailSubject: 'Your Writers’ Room code: {####}',
      }),
    });
  });

  it('a public client allowing only email codes and refresh, with our token lifetimes', () => {
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: ['ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      AccessTokenValidity: 60,
      RefreshTokenValidity: 43200,
      EnableTokenRevocation: true,
      PreventUserExistenceErrors: 'ENABLED',
      CallbackURLs: ['http://localhost:5173/api/auth/google/callback'],
      SupportedIdentityProviders: ['COGNITO'],
    });
  });

  it('keeps the user pool if the stack is ever deleted', () => {
    t.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain' });
  });

  it('adds Google only once configured, with its secret read from Secrets Manager', () => {
    t.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
    const withGoogle = Template.fromStack(
      new AuthStack(new App(), 'G', {
        env,
        config: {
          ...config,
          google: { clientId: 'abc.apps.googleusercontent.com', secretName: 'wr/google-oauth' },
        },
      }),
    );
    withGoogle.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Google',
      ProviderDetails: Match.objectLike({
        client_id: 'abc.apps.googleusercontent.com',
        client_secret: Match.stringLikeRegexp('resolve:secretsmanager:wr/google-oauth'),
      }),
    });
    withGoogle.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: Match.arrayWith(['Google']),
    });
    // The client names Google, so the provider must exist first (the first deploy failed, D-063).
    const [provider] = Object.keys(
      withGoogle.findResources('AWS::Cognito::UserPoolIdentityProvider'),
    );
    withGoogle.hasResource('AWS::Cognito::UserPoolClient', {
      DependsOn: Match.arrayWith([provider]),
    });
  });
});

describe('the beta (D-082, D-091)', () => {
  const build = (domain = false) => {
    const app = new App();
    const env2 = { account: '111111111111', region: 'us-east-2' };
    const cfg = domain
      ? { ...config, domain: { name: 'example.com', hostedZoneId: 'Z123' } }
      : config;
    const auth = new AuthStack(app, 'A', { env: env2, config: cfg });
    const data = new DataStack(app, 'D', { env: env2 });
    const cert = domain
      ? new CertStack(app, 'C', {
          env: { account: env2.account, region: 'us-east-1' },
          domain: cfg.domain!,
        })
      : undefined;
    const beta = new BetaStack(app, 'W', {
      env: env2,
      crossRegionReferences: domain,
      config: cfg,
      data,
      auth,
      image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:24-alpine'),
      ...(cert ? { certificate: cert.certificate } : {}),
    });
    return {
      data: Template.fromStack(data),
      beta: Template.fromStack(beta),
      auth: Template.fromStack(auth),
    };
  };
  const { data, beta, auth } = build();

  it('keeps the data: RDS micro with 7-day backups, DynamoDB with recovery, all retained', () => {
    data.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t4g.micro',
      Engine: 'postgres',
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });
    data.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot' });
    data.resourceCountIs('AWS::DynamoDB::GlobalTable', 3);
    data.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'wr-edit-log',
      KeySchema: [
        { AttributeName: 'docId', KeyType: 'HASH' },
        { AttributeName: 'k', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });
    for (const r of ['AWS::DynamoDB::GlobalTable', 'AWS::S3::Bucket'])
      for (const res of Object.values(data.findResources(r)))
        expect((res as { DeletionPolicy?: string }).DeletionPolicy).toBe('Retain');
    data.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('one ARM Fargate Spot task with the API and the sync server, migrating on start', () => {
    beta.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'api',
          Command: ['node', 'api.js'],
          Environment: Match.arrayWith([
            { Name: 'PGSSLMODE', Value: 'verify-full' },
            { Name: 'WR_MIGRATE_ON_START', Value: '1' },
          ]),
        }),
        Match.objectLike({
          Name: 'sync',
          Command: ['node', 'sync.js'],
          Environment: Match.arrayWith([{ Name: 'WR_INTERNAL_URL', Value: 'auto' }]),
        }),
      ]),
    });
    beta.hasResourceProperties('AWS::ECS::Service', {
      DesiredCount: 1,
      CapacityProviderStrategy: [{ CapacityProvider: 'FARGATE_SPOT', Weight: 1 }],
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 100,
        MaximumPercent: 200,
      }),
    });
  });

  it('an internal load balancer behind CloudFront: /api/* and /doc/* to the servers, the rest to S3', () => {
    beta.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internal' });
    beta.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/api/*', ViewerProtocolPolicy: 'https-only' }),
          Match.objectLike({ PathPattern: '/doc/*', ViewerProtocolPolicy: 'https-only' }),
        ]),
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
      }),
    });
    beta.resourceCountIs('AWS::CloudFront::VpcOrigin', 1);
  });

  it('the server role may call AdminGetUser (D-065), and the purge runs daily (D-090)', () => {
    const policies = JSON.stringify(beta.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('cognito-idp:AdminGetUser');
    expect(policies).toContain('dynamodb:DescribeTable');
    beta.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'cron(0 9 * * ? *)' });
  });

  it('alarms email Arnav: servers down, 5xx, edit-log trouble, crash bursts, a failed purge, the database', () => {
    beta.resourceCountIs('AWS::CloudWatch::Alarm', 8);
    beta.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });
    beta.hasResourceProperties('AWS::Logs::MetricFilter', {
      MetricTransformations: [Match.objectLike({ MetricName: 'DurabilityErrors' })],
    });
  });

  it('Cognito is protected from deletion (the checklist)', () => {
    auth.hasResourceProperties('AWS::Cognito::UserPool', { DeletionProtection: 'ACTIVE' });
  });

  it('with a domain: its certificate from us-east-1 and an alias record', () => {
    const t = build(true).beta;
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['example.com'] }),
    });
    t.resourceCountIs('AWS::Route53::RecordSet', 1);
  });
});

describe('the load-test cluster (D-093)', () => {
  const app = new App();
  const env2 = { account: '111111111111', region: 'us-east-2' };
  const data = new DataStack(app, 'D', { env: env2 });
  const t = Template.fromStack(
    new LoadStack(app, 'L', {
      env: env2,
      data,
      image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:24-alpine'),
    }),
  );

  it('three load-test servers on demand, and a generator, with throwaway tables', () => {
    t.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 3, LaunchType: 'FARGATE' });
    t.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '8192',
      ContainerDefinitions: [Match.objectLike({ Name: 'generator' })],
    });
    t.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: [Match.objectLike({ Name: 'sync', Command: ['node', 'lt-server.js'] })],
    });
    for (const res of Object.values(t.findResources('AWS::DynamoDB::GlobalTable')))
      expect((res as { DeletionPolicy?: string }).DeletionPolicy).toBe('Delete');
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', { TableName: 'wr-lt-edit-log' });
  });

  it('never touches the beta: no Cognito, no Postgres, none of its tables', () => {
    const json = JSON.stringify(t.toJSON());
    expect(json).not.toContain('cognito');
    expect(json).not.toContain('PGHOST');
    expect(json).not.toMatch(/"wr-edit-log"/);
  });
});
