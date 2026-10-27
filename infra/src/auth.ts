// Sign-in (SPEC 5.6; D-030, D-031, D-041, D-044): a Cognito user pool on the Essentials plan with
// passwordless email codes, our own public app client (USER_AUTH only), the sign-in domain for
// "Continue with Google", and Google itself once its OAuth client exists.
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  OAuthScope,
  ProviderAttribute,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolEmail,
  UserPoolIdentityProviderGoogle,
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { InfraConfig } from './config';

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: InfraConfig }) {
    super(scope, id, props);
    const { config } = props;

    const pool = new UserPool(this, 'Writers', {
      userPoolName: 'writers-room',
      featurePlan: FeaturePlan.ESSENTIALS,
      // The email is the username, and "Maya@…" is "maya@…" (D-044 (b)).
      signInAliases: { email: true },
      signInCaseSensitive: false,
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      // Passwordless email codes (D-030). Cognito requires "password" to stay allowed at the pool
      // level; our app client below permits only USER_AUTH, and nobody is ever given a password.
      signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      email: UserPoolEmail.withSES({
        fromEmail: config.senderEmail,
        fromName: 'Writers’ Room',
        sesRegion: config.region,
      }),
      // The sign-up code email (D-033's wording).
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Your Writers’ Room code: {####}',
        emailBody:
          'Enter {####} to sign in. It expires in a few minutes. If you didn’t ask for it, ignore this email.',
      },
      // Accounts and their scripts' owners: never deleted by tearing down a stack.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const google =
      config.google &&
      new UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: pool,
        clientId: config.google.clientId,
        // Kept in Secrets Manager, never in the template or the repo.
        clientSecretValue: SecretValue.secretsManager(config.google.secretName, {
          jsonField: 'clientSecret',
        }),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          emailVerified: ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
          fullname: ProviderAttribute.GOOGLE_NAME,
        },
      });

    const client = pool.addClient('Web', {
      userPoolClientName: 'writers-room-web',
      generateSecret: false, // a public client: the API calls Cognito without a secret (D-031)
      authFlows: { user: true }, // ALLOW_USER_AUTH (email codes) and refresh only; no passwords
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true, // signing out revokes the refresh token (D-044 (h))
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: config.appUrls.map((u) => `${u}/api/auth/google/callback`),
        logoutUrls: config.appUrls,
      },
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.COGNITO,
        ...(config.google ? [UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
    });
    // Naming Google on the client doesn't make CloudFormation create the provider first.
    if (google) client.node.addDependency(google);

    const domain = pool.addDomain('SignIn', {
      cognitoDomain: { domainPrefix: config.domainPrefix },
    });

    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'ClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'Domain', { value: domain.baseUrl() });
    new CfnOutput(this, 'GoogleRedirectUri', {
      value: `${domain.baseUrl()}/oauth2/idpresponse`,
      description: 'Paste into the Google OAuth client as an authorized redirect URI',
    });
  }
}
