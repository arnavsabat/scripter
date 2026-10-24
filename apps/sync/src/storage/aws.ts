// Builds the real storage (DynamoDB + S3) from configuration. With local endpoints (DynamoDB
// Local, SeaweedFS) it creates the tables and bucket if they're missing; on AWS they come from CDK.
import { DynamoEditLog, dynamoClient } from './dynamo';
import { DynamoLeaseStore, DynamoMembershipStore, ensureTable } from './coordination';
import { S3SnapshotStore, s3Client } from './s3';
import type { Storage } from './types';

export interface AwsStorageConfig {
  region: string;
  dynamoEndpoint?: string | undefined;
  s3Endpoint?: string | undefined;
  s3AccessKeyId?: string | undefined;
  s3SecretAccessKey?: string | undefined;
  editLogTable: string;
  coordinationTable: string;
  membersTable: string;
  snapshotBucket: string;
}

export function awsConfigFromEnv(env: NodeJS.ProcessEnv): AwsStorageConfig {
  return {
    region: env.AWS_REGION ?? 'us-east-1',
    dynamoEndpoint: env.DYNAMODB_ENDPOINT,
    s3Endpoint: env.S3_ENDPOINT,
    s3AccessKeyId: env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY,
    editLogTable: env.WR_EDIT_LOG_TABLE ?? 'wr-edit-log',
    coordinationTable: env.WR_COORDINATION_TABLE ?? 'wr-coordination',
    membersTable: env.WR_MEMBERS_TABLE ?? 'wr-members',
    snapshotBucket: env.S3_SNAPSHOT_BUCKET ?? 'wr-snapshots',
  };
}

export async function awsStorage(cfg: AwsStorageConfig): Promise<Storage> {
  const dynamo = dynamoClient(cfg.dynamoEndpoint, cfg.region);
  const log = new DynamoEditLog(dynamo, cfg.editLogTable, cfg.coordinationTable);
  const snapshots = new S3SnapshotStore(
    s3Client(cfg.s3Endpoint, cfg.region, cfg.s3AccessKeyId, cfg.s3SecretAccessKey),
    cfg.snapshotBucket,
    dynamo,
    cfg.coordinationTable,
  );
  if (cfg.dynamoEndpoint) {
    await log.ensureTable();
    await ensureTable(dynamo, cfg.coordinationTable, 'pk');
    await ensureTable(dynamo, cfg.membersTable, 'id');
  }
  if (cfg.s3Endpoint) await snapshots.ensureBucket();
  return {
    log,
    snapshots,
    leases: new DynamoLeaseStore(dynamo, cfg.coordinationTable),
    members: new DynamoMembershipStore(dynamo, cfg.membersTable),
  };
}
