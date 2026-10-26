// The CDK app (SPEC 5.5): three small stacks, deployed in this order (accounts step 8):
//   WrBudgets (the $20 / $40 alarms) → WrEmail (SES verification links) → WrAuth (Cognito).
import { App } from 'aws-cdk-lib';
import { AuthStack } from './auth';
import { BudgetsStack } from './budgets';
import { loadConfig } from './config';
import { EmailStack } from './email';

const config = loadConfig();
const app = new App();
const env = { region: config.region };
new BudgetsStack(app, 'WrBudgets', { env, alertEmail: config.alertEmail });
const email = new EmailStack(app, 'WrEmail', {
  env,
  senderEmail: config.senderEmail,
  testRecipients: config.testRecipients,
});
const auth = new AuthStack(app, 'WrAuth', { env, config });
auth.addStackDependency(email);
