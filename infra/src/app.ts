// The CDK app (SPEC 5.5). The accounts-phase stacks, deployed in this order (accounts step 8):
//   WrBudgets (the $20 / $40 alarms) → WrEmail (SES verification links) → WrAuth (Cognito).
// Then the beta itself (D-091; docs/runbook.md): WrDns (the domain's Route 53 zone, D-097),
// WrData (Postgres, DynamoDB, S3, the network), the certificate (infra/scripts/cert.sh: the free
// plan forbids stacks in us-east-1, D-099), and
// WrApp (CloudFront, the load balancer, the tasks; `-c servers=off` takes the servers away).
// WrLoad, the temporary load-test cluster (D-093), is deployed only for a load test, then destroyed.
import { App } from 'aws-cdk-lib';
import { AuthStack } from './auth';
import { BetaStack } from './beta';
import { BudgetsStack } from './budgets';
import { loadConfig } from './config';
import { DataStack } from './data';
import { DnsStack } from './dns';
import { EmailStack } from './email';
import { LoadStack } from './load';

const config = loadConfig();
const app = new App();
const env = { region: config.region };
new BudgetsStack(app, 'WrBudgets', { env, alertEmail: config.alertEmail });
if (config.zoneName) new DnsStack(app, 'WrDns', { env, zoneName: config.zoneName });
const email = new EmailStack(app, 'WrEmail', {
  env,
  senderEmail: config.senderEmail,
  testRecipients: config.testRecipients,
  ...(config.domain ? { domain: config.domain } : {}),
});
const auth = new AuthStack(app, 'WrAuth', { env, config });
auth.addStackDependency(email);

const data = new DataStack(app, 'WrData', {
  env,
  backupDays: config.accountPlan === 'free' ? 1 : 7, // the free plan's limit (D-098)
});
new BetaStack(app, 'WrApp', {
  env,
  config,
  data,
  auth,
  ...(config.certificateArn ? { certificateArn: config.certificateArn } : {}),
  // `beta:down` deploys with `-c servers=off` (D-097); anything else brings them up.
  servers: app.node.tryGetContext('servers') !== 'off',
});
// 3 servers (D-082); `-c loadServers=1` for the ramp, which measures one server alone.
new LoadStack(app, 'WrLoad', {
  env,
  data,
  servers: Number(app.node.tryGetContext('loadServers') ?? 3),
});
