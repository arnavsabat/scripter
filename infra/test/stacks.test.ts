// The CDK stacks, checked before anything reaches AWS (synthesized templates, no credentials).
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AuthStack } from '../src/auth';
import { BudgetsStack } from '../src/budgets';
import { loadConfig } from '../src/config';
import { EmailStack } from '../src/email';

const config = loadConfig({
  WR_ALERT_EMAIL: 'alerts@example.com',
  WR_SENDER_EMAIL: 'sender@example.com',
  WR_TEST_RECIPIENTS: 'sender@example.com, friend@example.com',
  WR_COGNITO_DOMAIN_PREFIX: 'writers-room-test',
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
        EmailSubject: 'Your Writers’ Room code: {####}',
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
