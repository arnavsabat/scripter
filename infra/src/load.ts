// The load-test cluster (SPEC 5.5: "spun up only for load tests and demos, then torn down"; D-082,
// D-093). Three sync servers running the load-test entry (it trusts this cluster's own key, never
// Cognito's users, and has no access to the beta's data), behind an internal load balancer like
// the beta's, and a load generator task in the same VPC. Its own DynamoDB tables and bucket,
// deleted with the stack. `cdk destroy WrLoad` when done.
//
// The key pair is made when the app is synthesized, so every deploy of this stack has a fresh
// one. Its private half sits in the generator's task definition: it grants nothing but writing
// into this throwaway cluster.
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, Billing, Capacity, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Peer, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { DataStack } from './data';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
/** The load-test edit log's provisioned capacity (D-103). */
export const LOAD_LOG_WRITES = 10_000;
export const LOAD_LOG_READS = 500;

export interface LoadStackProps extends StackProps {
  data: DataStack;
  /** How many sync servers (D-082: 3). */
  servers?: number;
  /** Tests build the stack without Docker: a placeholder image. */
  image?: ContainerImage;
}

export class LoadStack extends Stack {
  constructor(scope: Construct, id: string, props: LoadStackProps) {
    super(scope, id, props);
    const { vpc } = props.data;
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'test-key',
      alg: 'RS256',
      use: 'sig',
    };
    const keys = JSON.stringify({ privateJwk: privateKey.export({ format: 'jwk' }), publicJwk });
    const secret = randomBytes(24).toString('hex'); // the cluster secret and crash-switch key

    const table = (name: string, pk: string, sk?: string, billing = Billing.onDemand()) =>
      new TableV2(this, name, {
        tableName: `wr-lt-${name}`,
        partitionKey: { name: pk, type: AttributeType.STRING },
        ...(sk ? { sortKey: { name: sk, type: AttributeType.STRING } } : {}),
        billing,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    const tables = [
      // A brand-new on-demand table has few partitions (each at most 1,000 writes a second), and
      // the first 1,000-writer run was throttled 20-30k times a minute before DynamoDB could
      // split it (D-102). This table lives only for a test, so it's created at full size: 10,000
      // write units, about 10 partitions, roughly twice that run's demand (about $6.50 an hour).
      table(
        'edit-log',
        'docId',
        'k',
        Billing.provisioned({
          readCapacity: Capacity.fixed(LOAD_LOG_READS),
          writeCapacity: Capacity.autoscaled({
            minCapacity: LOAD_LOG_WRITES,
            maxCapacity: LOAD_LOG_WRITES,
          }),
        }),
      ),
      table('coordination', 'pk'), // peaked at 1,740 writes a second unthrottled: on demand is fine
      table('members', 'id'),
    ];
    const bucket = new Bucket(this, 'Snapshots', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });
    const storage = {
      AWS_REGION: this.region,
      WR_STORAGE: 'aws',
      WR_EDIT_LOG_TABLE: tables[0]!.tableName,
      WR_COORDINATION_TABLE: tables[1]!.tableName,
      WR_MEMBERS_TABLE: tables[2]!.tableName,
      S3_SNAPSHOT_BUCKET: bucket.bucketName,
      WR_CLUSTER_SECRET: secret,
      WR_LOADTEST_CRASH_PORT: '4001',
    };

    const cluster = new Cluster(this, 'Cluster', { vpc });
    const image =
      props.image ??
      ContainerImage.fromAsset(REPO, {
        file: 'infra/docker/loadtest.Dockerfile',
        platform: Platform.LINUX_ARM64,
      });
    const logs = new LogGroup(this, 'Logs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const group = new SecurityGroup(this, 'Group', { vpc, allowAllOutbound: true });
    group.addIngressRule(group, Port.tcpRange(4000, 4001), 'forwarding, and the crash switch');
    group.addIngressRule(Peer.ipv4(vpc.vpcCidrBlock), Port.tcp(80), 'the load balancer');
    const arm = {
      cpuArchitecture: CpuArchitecture.ARM64,
      operatingSystemFamily: OperatingSystemFamily.LINUX,
    };
    const grant = (task: FargateTaskDefinition) => {
      for (const t of tables) {
        t.grantReadWriteData(task.taskRole);
        task.taskRole.addToPrincipalPolicy(
          new PolicyStatement({ actions: ['dynamodb:DescribeTable'], resources: [t.tableArn] }),
        );
      }
      bucket.grantReadWrite(task.taskRole);
      bucket.grantDelete(task.taskRole);
    };

    // The sync servers: the beta's task size each, on demand (not Spot) so a run isn't interrupted.
    const serverTask = new FargateTaskDefinition(this, 'ServerTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: arm,
    });
    serverTask.addContainer('sync', {
      image,
      command: ['node', 'lt-server.js'],
      environment: {
        ...storage,
        PORT: '4000',
        WR_INTERNAL_URL: 'auto',
        WR_LOADTEST_PUBLIC_JWK: JSON.stringify(publicJwk),
      },
      portMappings: [{ containerPort: 4000 }, { containerPort: 4001 }],
      logging: new AwsLogDriver({ logGroup: logs, streamPrefix: 'sync' }),
      stopTimeout: Duration.seconds(30),
    });
    grant(serverTask);
    const service = new FargateService(this, 'Servers', {
      cluster,
      taskDefinition: serverTask,
      desiredCount: props.servers ?? 3,
      assignPublicIp: true,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [group],
      minHealthyPercent: 0,
    });

    const lb = new ApplicationLoadBalancer(this, 'Lb', {
      vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroup: group,
      idleTimeout: Duration.seconds(120),
    });
    lb.addListener('Http', {
      port: 80,
      open: false,
      defaultAction: ListenerAction.fixedResponse(404),
    }).addTargets('Sync', {
      priority: 10,
      conditions: [ListenerCondition.pathPatterns(['/doc/*', '/healthz'])],
      port: 4000,
      protocol: ApplicationProtocol.HTTP,
      targets: [service.loadBalancerTarget({ containerName: 'sync', containerPort: 4000 })],
      healthCheck: { path: '/healthz', interval: Duration.seconds(10), healthyThresholdCount: 2 },
      deregistrationDelay: Duration.seconds(5),
    });

    // The load generator: started by hand for each scenario (docs/runbook.md), in the same VPC.
    const generator = new FargateTaskDefinition(this, 'GeneratorTask', {
      cpu: 8192,
      memoryLimitMiB: 16384,
      runtimePlatform: arm,
    });
    generator.addContainer('generator', {
      image,
      command: ['node', 'run.js', 'rooms', '--servers', `ws://${lb.loadBalancerDnsName}`, '--json'],
      environment: { ...storage, WR_LOADTEST_KEYS: keys },
      logging: new AwsLogDriver({ logGroup: logs, streamPrefix: 'generator' }),
    });
    grant(generator);

    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'GeneratorTaskDefinition', { value: generator.taskDefinitionArn });
    new CfnOutput(this, 'ServersUrl', { value: `ws://${lb.loadBalancerDnsName}` });
    new CfnOutput(this, 'Subnets', {
      value: vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }).subnetIds.join(','),
    });
    new CfnOutput(this, 'SecurityGroup', { value: group.securityGroupId });
    new CfnOutput(this, 'LogGroup', { value: logs.logGroupName });
  }
}
