// The app itself for the closed beta (SPEC 5.5, D-082, D-091):
//
//   writers ──https──▶ CloudFront ─┬─ /*       ──▶ S3 (the web app, private, OAC)
//                                  ├─ /api/*   ──┐
//                                  └─ /doc/*   ──┴▶ internal load balancer ─▶ one Fargate task
//                                                   (a VPC origin: no public address)   ├ api  :4100
//                                                                                       └ sync :4000
//
// One small always-on task (ARM, Fargate Spot): the API and the sync server as two containers
// from one image. A Spot interruption is a failover the sync design already survives with zero
// lost edits (D-082's levers). The daily purge (D-090) runs as its own short task. Alarms email
// Arnav (D-082: CloudWatch only).
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
  type BehaviorOptions,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin, VpcOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  HttpCodeTarget,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { EcsTask } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FilterPattern, LogGroup, MetricFilter, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AuthStack } from './auth';
import type { InfraConfig } from './config';
import type { DataStack } from './data';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const WEB_DIST = fileURLToPath(new URL('../../apps/web/dist', import.meta.url));

export interface BetaStackProps extends StackProps {
  config: InfraConfig;
  data: DataStack;
  auth: AuthStack;
  /** The domain's certificate, from the us-east-1 stack (CloudFront only takes certificates there). */
  certificate?: ICertificate;
  /** Tests build the stack without Docker: a placeholder image. */
  image?: ContainerImage;
}

export class BetaStack extends Stack {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: BetaStackProps) {
    super(scope, id, props);
    const { config, data, auth } = props;
    const { vpc } = data;

    // ---- The servers ---------------------------------------------------------------------
    const cluster = new Cluster(this, 'Cluster', { vpc, enableFargateCapacityProviders: true });
    const image =
      props.image ??
      ContainerImage.fromAsset(REPO, {
        file: 'infra/docker/server.Dockerfile',
        platform: Platform.LINUX_ARM64,
      });
    const logs = new LogGroup(this, 'Logs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const appUrl = config.domain ? `https://${config.domain.name}` : config.appUrls.at(-1)!;
    // What every container shares: Cognito, the region, Postgres (verified TLS, D-091) and storage.
    const environment = {
      AWS_REGION: this.region,
      COGNITO_REGION: config.region,
      COGNITO_USER_POOL_ID: auth.pool.userPoolId,
      COGNITO_CLIENT_ID: auth.client.userPoolClientId,
      PGHOST: data.db.instanceEndpoint.hostname,
      PGPORT: String(data.db.instanceEndpoint.port),
      PGDATABASE: 'scripter',
      PGSSLMODE: 'verify-full',
      WR_STORAGE: 'aws',
      S3_SNAPSHOT_BUCKET: data.snapshots.bucketName,
      WR_EDIT_LOG_TABLE: data.tables.log.tableName,
      WR_COORDINATION_TABLE: data.tables.coordination.tableName,
      WR_MEMBERS_TABLE: data.tables.members.tableName,
    };
    const secrets = {
      PGUSER: EcsSecret.fromSecretsManager(data.db.secret!, 'username'),
      PGPASSWORD: EcsSecret.fromSecretsManager(data.db.secret!, 'password'),
    };
    const task = new FargateTaskDefinition(this, 'Task', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });
    const api = task.addContainer('api', {
      image,
      command: ['node', 'api.js'],
      environment: {
        ...environment,
        API_PORT: '4100',
        APP_URL: appUrl,
        COGNITO_DOMAIN: auth.domain.baseUrl(),
        WR_SENDER_EMAIL: config.senderEmail,
        WR_MIGRATE_ON_START: '1',
      },
      secrets,
      portMappings: [{ containerPort: 4100 }],
      logging: new AwsLogDriver({ logGroup: logs, streamPrefix: 'api' }),
      stopTimeout: Duration.seconds(20),
    });
    const sync = task.addContainer('sync', {
      image,
      command: ['node', 'sync.js'],
      // auto: the task's own private address, so servers can forward to each other (D-022).
      environment: { ...environment, PORT: '4000', WR_INTERNAL_URL: 'auto' },
      secrets: { ...secrets, WR_CLUSTER_SECRET: EcsSecret.fromSecretsManager(data.clusterSecret) },
      portMappings: [{ containerPort: 4000 }],
      logging: new AwsLogDriver({ logGroup: logs, streamPrefix: 'sync' }),
      // Room to save, release leases and hand writers over gracefully (SPEC 5.4).
      stopTimeout: Duration.seconds(30),
    });
    grantStorage(task, data, auth, config);

    const service = new FargateService(this, 'Service', {
      cluster,
      taskDefinition: task,
      desiredCount: 1,
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE_SPOT', weight: 1 }],
      assignPublicIp: true, // no NAT (data.ts): the task reaches Cognito and SES directly
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [data.servers],
      // A deploy starts the new task before the old one stops: two sync servers briefly, which
      // the leases and the graceful handoff are built for.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      enableExecuteCommand: true,
    });

    // ---- The load balancer: internal, reached only by CloudFront through the VPC ---------
    const lb = new ApplicationLoadBalancer(this, 'Lb', {
      vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroup: data.lb,
      idleTimeout: Duration.seconds(120), // longer than the client's 5 s heartbeat (D-022)
    });
    const listener = lb.addListener('Http', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      open: false, // the data stack's rule: from inside the VPC only
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'not found',
      }),
    });
    const apiTargets = listener.addTargets('Api', {
      priority: 10,
      conditions: [ListenerCondition.pathPatterns(['/api/*'])],
      port: 4100,
      protocol: ApplicationProtocol.HTTP,
      targets: [
        service.loadBalancerTarget({ containerName: api.containerName, containerPort: 4100 }),
      ],
      healthCheck: {
        path: '/api/health',
        interval: Duration.seconds(15),
        healthyThresholdCount: 2,
      },
      deregistrationDelay: Duration.seconds(15),
    });
    const syncTargets = listener.addTargets('Sync', {
      priority: 20,
      conditions: [ListenerCondition.pathPatterns(['/doc/*'])],
      port: 4000,
      protocol: ApplicationProtocol.HTTP,
      targets: [
        service.loadBalancerTarget({ containerName: sync.containerName, containerPort: 4000 }),
      ],
      healthCheck: { path: '/healthz', interval: Duration.seconds(15), healthyThresholdCount: 2 },
      deregistrationDelay: Duration.seconds(35), // the sync container's graceful stop, plus a beat
    });

    // ---- The web app and CloudFront ------------------------------------------------------
    const web = new Bucket(this, 'Web', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // A single-page app: any path without a file extension is the app (index.html). Done here
    // rather than with an error page, which would also swallow the API's own 404s.
    const spa = new CfFunction(this, 'SpaRoutes', {
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) r.uri = '/index.html'; return r; }",
      ),
    });
    const servers = VpcOrigin.withApplicationLoadBalancer(lb, {
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
      readTimeout: Duration.seconds(60),
    });
    const toServers: BehaviorOptions = {
      origin: servers,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };
    this.distribution = new Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(web),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{ function: spa, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { '/api/*': toServers, '/doc/*': toServers },
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      ...(config.domain && props.certificate
        ? { domainNames: [config.domain.name], certificate: props.certificate }
        : {}),
    });
    if (config.domain) {
      const zone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: config.domain.hostedZoneId,
        zoneName: config.domain.name,
      });
      new ARecord(this, 'Apex', {
        zone,
        target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      });
    }
    // The built app (apps/web/dist, `pnpm --filter @wr/web build`), replaced on every deploy.
    if (existsSync(WEB_DIST))
      new BucketDeployment(this, 'WebFiles', {
        destinationBucket: web,
        sources: [Source.asset(WEB_DIST)],
        distribution: this.distribution,
        distributionPaths: ['/index.html'],
        memoryLimit: 512,
      });

    // ---- The daily purge (D-090) ---------------------------------------------------------
    const purge = new FargateTaskDefinition(this, 'PurgeTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });
    purge.addContainer('purge', {
      image,
      command: ['node', 'purge.js'],
      environment,
      secrets,
      logging: new AwsLogDriver({ logGroup: logs, streamPrefix: 'purge' }),
    });
    grantStorage(purge, data, auth, config);
    new Rule(this, 'PurgeDaily', {
      schedule: Schedule.cron({ hour: '9', minute: '0' }), // 09:00 UTC, early morning in Toronto
      targets: [
        new EcsTask({
          cluster,
          taskDefinition: purge,
          subnetSelection: { subnetType: SubnetType.PUBLIC },
          assignPublicIp: true,
          securityGroups: [data.servers],
        }),
      ],
    });

    // ---- Alarms, emailed to Arnav (D-082) ------------------------------------------------
    const topic = new Topic(this, 'Alerts');
    topic.addSubscription(new EmailSubscription(config.alertEmail));
    const alarm = (name: string, metric: IMetric, threshold: number, below = false, periods = 1) =>
      new Alarm(this, name, {
        metric,
        threshold,
        evaluationPeriods: periods,
        comparisonOperator: below
          ? ComparisonOperator.LESS_THAN_THRESHOLD
          : ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: below ? TreatMissingData.BREACHING : TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new SnsAction(topic));
    const minute = Duration.minutes(1);
    alarm(
      'ApiDown',
      apiTargets.metrics.healthyHostCount({ period: minute, statistic: 'Minimum' }),
      1,
      true,
      3,
    );
    alarm(
      'SyncDown',
      syncTargets.metrics.healthyHostCount({ period: minute, statistic: 'Minimum' }),
      1,
      true,
      3,
    );
    alarm(
      'ServerErrors',
      lb.metrics.httpCodeTarget(HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5) }),
      5,
    );
    // Anything that threatens a durable edit: an append, a snapshot or a load that failed.
    const durability = new MetricFilter(this, 'DurabilityErrors', {
      logGroup: logs,
      metricNamespace: 'Scripter',
      metricName: 'DurabilityErrors',
      filterPattern: FilterPattern.literal(
        '{ $.level = "error" && ($.msg = "append failed*" || $.msg = "snapshot failed" || $.msg = "room load failed" || $.msg = "truncate failed") }',
      ),
      metricValue: '1',
    });
    alarm(
      'EditLogTrouble',
      durability.metric({ period: Duration.minutes(5), statistic: 'Sum' }),
      1,
    );
    // Browser crash reports (D-083): a burst means a broken release.
    const crashes = new MetricFilter(this, 'BrowserCrashes', {
      logGroup: logs,
      metricNamespace: 'Scripter',
      metricName: 'BrowserCrashes',
      filterPattern: FilterPattern.literal('{ $.msg = "browser error" }'),
      metricValue: '1',
    });
    alarm('CrashBurst', crashes.metric({ period: Duration.hours(1), statistic: 'Sum' }), 20);
    const purgeFailed = new MetricFilter(this, 'PurgeFailures', {
      logGroup: logs,
      metricNamespace: 'Scripter',
      metricName: 'PurgeFailures',
      filterPattern: FilterPattern.literal('{ $.msg = "purge failed" }'),
      metricValue: '1',
    });
    alarm('PurgeFailed', purgeFailed.metric({ period: Duration.hours(1), statistic: 'Sum' }), 1);
    alarm(
      'DbStorageLow',
      data.db.metricFreeStorageSpace({ period: Duration.minutes(15) }),
      2 * 1024 ** 3,
      true,
    );
    alarm('DbBusy', data.db.metricCPUUtilization({ period: Duration.minutes(15) }), 80);

    new CfnOutput(this, 'Url', {
      value: config.domain
        ? `https://${config.domain.name}`
        : `https://${this.distribution.distributionDomainName}`,
      description: 'The beta; add it to WR_APP_URLS for Google sign-in, then redeploy WrAuth',
    });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'PurgeTaskDefinition', { value: purge.taskDefinitionArn });
    new CfnOutput(this, 'ServersGroup', { value: data.servers.securityGroupId });
    new CfnOutput(this, 'LogGroup', { value: logs.logGroupName });
    new CfnOutput(this, 'PublicSubnets', {
      value: vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }).subnetIds.join(','),
    });
    new CfnOutput(this, 'PrivateSubnets', {
      value: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED }).subnetIds.join(','),
      description: 'For a CloudShell VPC environment that reads the metrics (docs/runbook.md)',
    });
  }
}

/** What a server task may touch: its tables, the snapshot bucket, SES, and AdminGetUser. */
function grantStorage(
  task: FargateTaskDefinition,
  data: DataStack,
  auth: AuthStack,
  config: InfraConfig,
) {
  const role = task.taskRole;
  for (const t of Object.values(data.tables)) {
    t.grantReadWriteData(role);
    role.addToPrincipalPolicy(
      new PolicyStatement({ actions: ['dynamodb:DescribeTable'], resources: [t.tableArn] }),
    );
  }
  data.snapshots.grantReadWrite(role);
  data.snapshots.grantDelete(role);
  // Returning email sign-ins ask Cognito for the account's status (D-065).
  role.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [auth.pool.userPoolArn],
    }),
  );
  role.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [
        `arn:aws:ses:${config.region}:${Stack.of(task).account}:identity/*`,
        `arn:aws:ses:${config.region}:${Stack.of(task).account}:configuration-set/*`,
      ],
    }),
  );
}
