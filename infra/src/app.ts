// The CDK app (SPEC 5.5). The accounts-phase stacks, deployed in this order (accounts step 8):
//   WrBudgets (the $20 / $40 alarms) → WrEmail (SES verification links) → WrAuth (Cognito).
// Then the beta itself (D-091; docs/runbook.md): WrData (Postgres, DynamoDB, S3, the network),
// WrCert (only with a domain, in us-east-1), and WrApp (CloudFront, the load balancer, the task).
import { App } from 'aws-cdk-lib';
import { AuthStack } from './auth';
import { BetaStack } from './beta';
import { BudgetsStack } from './budgets';
import { CertStack } from './cert';
import { loadConfig } from './config';
import { DataStack } from './data';
import { EmailStack } from './email';

const config = loadConfig();
const app = new App();
const env = { region: config.region };
new BudgetsStack(app, 'WrBudgets', { env, alertEmail: config.alertEmail });
const email = new EmailStack(app, 'WrEmail', {
  env,
  senderEmail: config.senderEmail,
  testRecipients: config.testRecipients,
  ...(config.domain ? { domain: config.domain } : {}),
});
const auth = new AuthStack(app, 'WrAuth', { env, config });
auth.addStackDependency(email);

const data = new DataStack(app, 'WrData', { env });
const cert =
  config.domain &&
  new CertStack(app, 'WrCert', { env: { region: 'us-east-1' }, domain: config.domain });
new BetaStack(app, 'WrApp', {
  env,
  crossRegionReferences: !!cert,
  config,
  data,
  auth,
  ...(cert ? { certificate: cert.certificate } : {}),
});
