// The CDK app's stacks (SPEC 5.5). `src/app.ts` is the entry point the CDK CLI runs.
export { AuthStack } from './auth';
export { BudgetsStack } from './budgets';
export { EmailStack } from './email';
export { loadConfig, type InfraConfig } from './config';
