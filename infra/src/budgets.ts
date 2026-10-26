// Budget alarms at $20 and $40 a month, deployed before anything else (SPEC 5.5, D-038). On the
// free plan nothing can be charged, but the alarms stay in place for the paid plan at the beta.
import { Stack, type StackProps } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';

export const BUDGET_LIMIT_USD = 40;

export class BudgetsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { alertEmail: string }) {
    super(scope, id, props);
    const to = [{ subscriptionType: 'EMAIL', address: props.alertEmail }];
    const at = (percent: number, kind: 'ACTUAL' | 'FORECASTED') => ({
      notification: {
        notificationType: kind,
        comparisonOperator: 'GREATER_THAN',
        threshold: percent,
        thresholdType: 'PERCENTAGE',
      },
      subscribers: to,
    });
    new CfnBudget(this, 'Monthly', {
      budget: {
        budgetName: 'writers-room-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: BUDGET_LIMIT_USD, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        at(50, 'ACTUAL'), // $20 spent
        at(100, 'ACTUAL'), // $40 spent
        at(100, 'FORECASTED'), // on track to pass $40 this month
      ],
    });
  }
}
