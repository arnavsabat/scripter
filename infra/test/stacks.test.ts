// The CDK stacks, checked before anything reaches AWS (synthesized templates, no credentials).
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AuthStack } from '../src/auth';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { BetaStack } from '../src/beta';
import { BudgetsStack } from '../src/budgets';
import { DataStack } from '../src/data';
import { DnsStack } from '../src/dns';
import { LoadStack } from '../src/load';
import { loadConfig } from '../src/config';
import { EmailStack } from '../src/email';

const settings = {
  WR_ALERT_EMAIL: 'alerts@example.com',
  WR_SENDER_EMAIL: 'sender@example.com',
  WR_TEST_RECIPIENTS: 'sender@example.com, friend@example.com',
  WR_COGNITO_DOMAIN_PREFIX: 'scripter-test',
};
const config = loadConfig(settings);
const CERT = 'arn:aws:acm:us-east-1:111111111111:certificate/abc';
const withDomain = loadConfig({
  ...settings,
  WR_DOMAIN: 'example.com',
  WR_HOSTED_ZONE_ID: 'Z123',
  WR_CERTIFICATE_ARN: CERT,
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

describe('the domain (D-096, D-097)', () => {
  it('its name alone makes only the zone; with the zone ID, the stacks use it', () => {
    const named = loadConfig({ ...settings, WR_DOMAIN: 'example.com' });
    expect(named.zoneName).toBe('example.com');
    expect(named.domain).toBeUndefined();
    expect(named.fromEmail).toBe('sender@example.com');
    expect(withDomain.domain).toEqual({ name: 'example.com', hostedZoneId: 'Z123' });
    expect(withDomain.fromEmail).toBe('no-reply@example.com');
    expect(withDomain.senderEmail).toBe('sender@example.com'); // still an SES identity
    expect(withDomain.appUrls).toEqual(['http://localhost:5173', 'https://example.com']);
  });

  it('a retained Route 53 zone that prints its nameservers', () => {
    const t = Template.fromStack(new DnsStack(new App(), 'N', { env, zoneName: 'example.com' }));
    t.hasResource('AWS::Route53::HostedZone', {
      Properties: { Name: 'example.com.' },
      DeletionPolicy: 'Retain',
    });
    t.hasOutput('NameServers', {});
  });

  it('codes come from no-reply@ the domain, a verified SES domain identity', () => {
    const t = Template.fromStack(new AuthStack(new App(), 'A', { env, config: withDomain }));
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      EmailConfiguration: Match.objectLike({ From: 'Scripter <no-reply@example.com>' }),
    });
    const [pool] = Object.values(t.findResources('AWS::Cognito::UserPool'));
    expect(JSON.stringify(pool)).toContain(':identity/example.com');
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
        EmailSubject: 'Your Scripter code: {####}',
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
  const build = (domain = false, servers = true) => {
    const app = new App();
    const env2 = { account: '111111111111', region: 'us-east-2' };
    const cfg = domain ? withDomain : config;
    const auth = new AuthStack(app, 'A', { env: env2, config: cfg });
    const data = new DataStack(app, 'D', { env: env2 });
    const beta = new BetaStack(app, 'W', {
      env: env2,
      config: cfg,
      data,
      auth,
      image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:24-alpine'),
      ...(cfg.certificateArn ? { certificateArn: cfg.certificateArn } : {}),
      servers,
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
      Replicas: [
        Match.objectLike({
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
            RecoveryPeriodInDays: 7,
          },
        }),
      ],
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
    data.hasOutput('DbInstanceId', {}); // for beta:up and beta:down
  });

  it("the load balancer lets CloudFront's origin-facing addresses in on port 80 (D-100)", () => {
    data.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 80,
      ToPort: 80,
      SourcePrefixListId: 'pl-b6a144df',
    });
    expect(() => new DataStack(new App(), 'X', { env: { region: 'eu-west-1' } })).toThrow(
      /prefix list for eu-west-1/,
    );
  });

  it('on the AWS free plan, one day of Postgres backups, its limit (D-098)', () => {
    expect(config.accountPlan).toBe('free');
    expect(loadConfig({ ...settings, WR_ACCOUNT_PLAN: 'paid' }).accountPlan).toBe('paid');
    expect(() => loadConfig({ ...settings, WR_ACCOUNT_PLAN: 'pro' })).toThrow();
    const free = new DataStack(new App(), 'F', { env, backupDays: 1 });
    Template.fromStack(free).hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 1,
    });
  });

  it('two ARM Fargate Spot tasks, each the API and a sync server, migrating on start', () => {
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
      DesiredCount: 2,
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
    beta.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 9 * * ? *)',
      State: 'ENABLED',
    });
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

  it('with a domain: its us-east-1 certificate by ARN, the site and sign-in at auth.<domain>', () => {
    const { beta: t } = build(true);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['example.com'],
        ViewerCertificate: Match.objectLike({ AcmCertificateArn: CERT }),
      }),
    });
    t.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'auth.example.com',
      CustomDomainConfig: { CertificateArn: CERT },
    });
    // No stack in us-east-1 (the free plan forbids it, D-099), so no cross-region plumbing.
    expect(JSON.stringify(t.toJSON())).not.toContain('CrossRegion');
    t.resourceCountIs('AWS::Route53::RecordSet', 2);
    // Cognito refuses a custom domain whose parent doesn't resolve yet.
    const [apex] = Object.keys(
      t.findResources('AWS::Route53::RecordSet', { Properties: { Name: 'example.com.' } }),
    );
    t.hasResource('AWS::Cognito::UserPoolDomain', { DependsOn: Match.arrayWith([apex]) });
    // The API's Google sign-in goes through auth.<domain>, and its mail comes from the domain.
    const [signIn] = Object.keys(t.findResources('AWS::Cognito::UserPoolDomain'));
    const api = Object.values(t.findResources('AWS::ECS::TaskDefinition'))
      .flatMap(
        (d) =>
          (
            d as {
              Properties: { ContainerDefinitions: { Name: string; Environment: unknown[] }[] };
            }
          ).Properties.ContainerDefinitions,
      )
      .find((c) => c.Name === 'api')!;
    const envOf = (name: string) =>
      JSON.stringify(api.Environment.find((e) => (e as { Name: string }).Name === name));
    expect(envOf('COGNITO_DOMAIN')).toContain(signIn);
    expect(envOf('WR_SENDER_EMAIL')).toContain('no-reply@example.com');
    expect(envOf('APP_URL')).toContain('https://example.com');
  });

  it('servers down (D-097): no load balancer or tasks, 503s at the edge, Postgres kept stopped', () => {
    const { beta: t } = build(true, false);
    t.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0);
    t.resourceCountIs('AWS::ECS::Service', 0);
    t.resourceCountIs('AWS::CloudFront::VpcOrigin', 0);
    // /api/* and /doc/* still exist, answered by a function, so the app sees "can't reach".
    const fns = t.findResources('AWS::CloudFront::Function');
    const down = Object.entries(fns).find(([, f]) => JSON.stringify(f).includes('statusCode: 503'));
    expect(down).toBeDefined();
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith(
          ['/api/*', '/doc/*'].map((PathPattern) =>
            Match.objectLike({
              PathPattern,
              FunctionAssociations: [
                Match.objectLike({
                  EventType: 'viewer-request',
                  FunctionARN: { 'Fn::GetAtt': [down![0], 'FunctionARN'] },
                }),
              ],
            }),
          ),
        ),
      }),
    });
    // The site, its domain and sign-in stay.
    t.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    t.resourceCountIs('AWS::Route53::RecordSet', 2);
    // No purge (it needs Postgres), only the alarms that can still fire, and a nightly stop.
    t.hasResourceProperties('AWS::Events::Rule', { State: 'DISABLED' });
    t.resourceCountIs('AWS::CloudWatch::Alarm', 3);
    t.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(0 10 * * ? *)',
      Target: Match.objectLike({ RetryPolicy: Match.objectLike({ MaximumRetryAttempts: 0 }) }),
    });
    const [stop] = Object.values(t.findResources('AWS::Scheduler::Schedule'));
    expect(JSON.stringify(stop)).toContain(':aws-sdk:rds:stopDBInstance');
    expect(JSON.stringify(stop)).toContain('DbInstanceIdentifier');
    expect(JSON.stringify(t.findResources('AWS::IAM::Policy'))).toContain('rds:StopDBInstance');
  });

  it("a domain without its certificate yet: the site stays on CloudFront's address", () => {
    const app = new App();
    const env2 = { account: '111111111111', region: 'us-east-2' };
    const cfg = loadConfig({ ...settings, WR_DOMAIN: 'example.com', WR_HOSTED_ZONE_ID: 'Z123' });
    expect(cfg.certificateArn).toBeUndefined();
    const t = Template.fromStack(
      new BetaStack(app, 'W', {
        env: env2,
        config: cfg,
        data: new DataStack(app, 'D', { env: env2 }),
        auth: new AuthStack(app, 'A', { env: env2, config: cfg }),
        image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:24-alpine'),
      }),
    );
    t.resourceCountIs('AWS::Route53::RecordSet', 0);
    t.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);
  });

  it('the load balancer drops a dead server within about 10 s: checks every 5 s, 2 failures (D-105)', () => {
    for (const path of ['/api/health', '/healthz'])
      beta.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        HealthCheckPath: path,
        HealthCheckIntervalSeconds: 5,
        HealthCheckTimeoutSeconds: 2,
        UnhealthyThresholdCount: 2,
      });
  });

  it('servers up: no schedule stopping Postgres', () => {
    beta.resourceCountIs('AWS::Scheduler::Schedule', 0);
  });

  it('the "no healthy server" alarms wait for the service, so beta:up doesn\'t email them (D-099)', () => {
    const [service] = Object.keys(beta.findResources('AWS::ECS::Service'));
    const healthy = Object.values(beta.findResources('AWS::CloudWatch::Alarm')).filter(
      (a) =>
        (a as { Properties: { MetricName?: string } }).Properties.MetricName === 'HealthyHostCount',
    );
    expect(healthy).toHaveLength(2);
    for (const a of healthy) expect((a as { DependsOn?: string[] }).DependsOn).toContain(service);
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

  it('the edit log is created at full size, so a run is not throttled while DynamoDB splits it (D-102)', () => {
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'wr-lt-edit-log',
      BillingMode: 'PROVISIONED',
      WriteProvisionedThroughputSettings: Match.objectLike({
        WriteCapacityAutoScalingSettings: Match.objectLike({
          MinCapacity: 10_000,
          MaxCapacity: 10_000,
        }),
      }),
    });
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'wr-lt-coordination',
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('servers at the beta size by default, 1 vCPU on request, with the fast health check (D-105)', () => {
    t.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '512',
      Memory: '1024',
      ContainerDefinitions: [Match.objectLike({ Name: 'sync' })],
    });
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckIntervalSeconds: 5,
      UnhealthyThresholdCount: 2,
    });
    const app2 = new App();
    const big = Template.fromStack(
      new LoadStack(app2, 'L', {
        env: env2,
        data: new DataStack(app2, 'D', { env: env2 }),
        servers: 4,
        serverCpu: 1024,
        image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:24-alpine'),
      }),
    );
    big.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '1024',
      Memory: '2048',
      ContainerDefinitions: [Match.objectLike({ Name: 'sync' })],
    });
    big.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 4 });
  });

  it('never touches the beta: no Cognito, no Postgres, none of its tables', () => {
    const json = JSON.stringify(t.toJSON());
    expect(json).not.toContain('cognito');
    expect(json).not.toContain('PGHOST');
    expect(json).not.toMatch(/"wr-edit-log"/);
  });
});
