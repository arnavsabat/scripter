// Everything the beta keeps (D-082, D-091): the network, Postgres, the sync service's DynamoDB
// tables and snapshot bucket, and the cluster secret. Nothing here is deleted by tearing a stack
// down (RETAIN, or a final snapshot for the database), so the app stack can come and go.
//
// The network has no NAT gateway (about $35 a month, the D-082-era cost levers): the task gets
// a public address for reaching Cognito and SES, gateway endpoints (free) carry DynamoDB and S3
// traffic, and Postgres and the load balancer sit in isolated subnets with no internet route.
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import {
  GatewayVpcEndpointAwsService,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  StorageType,
} from 'aws-cdk-lib/aws-rds';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface DataStackProps extends StackProps {
  /** Table and secret names get this prefix: '' for the beta, 'lt-' for a load-test cluster. */
  prefix?: string;
}

export class DataStack extends Stack {
  readonly vpc: Vpc;
  readonly db: DatabaseInstance;
  /** The servers (and the purge, and a CloudShell session for the metrics): may reach Postgres. */
  readonly servers: SecurityGroup;
  /** The internal load balancer: reached only from inside the VPC (CloudFront's VPC origin). */
  readonly lb: SecurityGroup;
  readonly tables: { log: TableV2; coordination: TableV2; members: TableV2 };
  readonly snapshots: Bucket;
  readonly clusterSecret: Secret;

  constructor(scope: Construct, id: string, props: DataStackProps = {}) {
    super(scope, id, props);
    const prefix = props.prefix ?? '';

    this.vpc = new Vpc(this, 'Network', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.vpc.addGatewayEndpoint('S3', { service: GatewayVpcEndpointAwsService.S3 });
    this.vpc.addGatewayEndpoint('DynamoDB', { service: GatewayVpcEndpointAwsService.DYNAMODB });

    // Who may talk to whom. All here, so the rules never reach across stacks.
    this.lb = new SecurityGroup(this, 'LoadBalancer', {
      vpc: this.vpc,
      description: 'The internal load balancer',
      allowAllOutbound: true,
    });
    this.lb.addIngressRule(Peer.ipv4(this.vpc.vpcCidrBlock), Port.tcp(80), 'CloudFront VPC origin');
    this.servers = new SecurityGroup(this, 'Servers', {
      vpc: this.vpc,
      description: 'The API, the sync servers and the purge',
      allowAllOutbound: true,
    });
    this.servers.addIngressRule(this.lb, Port.tcp(4100), 'the load balancer to the API');
    this.servers.addIngressRule(this.lb, Port.tcp(4000), 'the load balancer to sync');
    this.servers.addIngressRule(this.servers, Port.tcp(4000), 'sync servers forwarding (D-022)');
    // Postgres (D-082): RDS db.t4g.micro, single-AZ, 7 days of automatic backups.
    const dbGroup = new SecurityGroup(this, 'Db', {
      vpc: this.vpc,
      description: 'Postgres',
      allowAllOutbound: false,
    });
    dbGroup.addIngressRule(this.servers, Port.tcp(5432), 'the servers');
    this.db = new DatabaseInstance(this, 'Postgres', {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_18_3 }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      vpc: this.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbGroup],
      credentials: Credentials.fromGeneratedSecret('wr', { secretName: `wr/${prefix}postgres` }),
      databaseName: 'scripter',
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: RetentionDays.ONE_MONTH,
      autoMinorVersionUpgrade: true,
    });
    // For `beta:up` / `beta:down`, which start and stop it (D-097).
    new CfnOutput(this, 'DbInstanceId', { value: this.db.instanceIdentifier });

    // The sync service's DynamoDB tables (SPEC 5.4), on demand. The edit log and coordination
    // table (leases, snapshot pointers) get point-in-time recovery: they hold the writing.
    // (Snapshot objects in S3 aren't versioned: the purge's deletes are final.)
    const table = (name: string, pk: string, sk?: string, pitr = true) =>
      new TableV2(this, name, {
        tableName: `wr-${prefix}${name}`,
        partitionKey: { name: pk, type: AttributeType.STRING },
        ...(sk ? { sortKey: { name: sk, type: AttributeType.STRING } } : {}),
        billing: Billing.onDemand(),
        // 7 days, like Postgres's backups, so "kept for 7 days" in the Privacy Policy holds.
        pointInTimeRecoverySpecification: pitr
          ? { pointInTimeRecoveryEnabled: true, recoveryPeriodInDays: 7 }
          : { pointInTimeRecoveryEnabled: false },
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.tables = {
      log: table('edit-log', 'docId', 'k'),
      coordination: table('coordination', 'pk'),
      members: table('members', 'id', undefined, false), // heartbeats only: rebuilt in seconds
    };

    // Snapshots and restore points (SPEC 5.2, 5.4).
    this.snapshots = new Bucket(this, 'Snapshots', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });

    // Signs identities forwarded between sync servers (D-022).
    this.clusterSecret = new Secret(this, 'ClusterSecret', {
      secretName: `wr/${prefix}cluster-secret`,
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });
  }
}
