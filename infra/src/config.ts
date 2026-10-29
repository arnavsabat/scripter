// Settings for the CDK app, from infra/.env.local (git-ignored: Arnav's addresses stay out of the
// public repo, D-054). See infra/.env.local.example for every setting.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface InfraConfig {
  /** us-east-2 (D-058; the free plan's organization policy forbids ca-central-1). */
  region: string;
  /** The AWS account's plan (WR_ACCOUNT_PLAN, D-098): the free plan caps Postgres backups at 1 day. */
  accountPlan: 'free' | 'paid';
  /** Budget alerts go here (D-038). */
  alertEmail: string;
  /** A verified SES address (D-038): the sender until the domain exists, and an SES identity after. */
  senderEmail: string;
  /** Who sign-in codes and invitations come from: `no-reply@<domain>` once its zone exists (D-096). */
  fromEmail: string;
  /** Addresses SES's sandbox may send to: the demo's accounts (D-054). */
  testRecipients: string[];
  /** Globally unique prefix for the Cognito sign-in domain (<prefix>.auth.<region>.amazoncognito.com). */
  domainPrefix: string;
  /** Where the web app runs; Google returns to <appUrl>/api/auth/google/callback. */
  appUrls: string[];
  /** The Google OAuth client, once created (step 8, part 2). */
  google?: { clientId: string; secretName: string };
  /** The domain's name (WR_DOMAIN, D-096): WrDns makes its Route 53 zone (D-097). */
  zoneName?: string;
  /** The domain, once its zone exists (WR_HOSTED_ZONE_ID, from WrDns). Unset: CloudFront's address. */
  domain?: { name: string; hostedZoneId: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): InfraConfig {
  const file = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (env === process.env && existsSync(file)) process.loadEnvFile(file);
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`infra: set ${k} in infra/.env.local (see .env.local.example)`);
    return v;
  };
  const list = (v: string) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  // The domain counts once its zone exists: before that, only WrDns uses the name.
  const domain =
    env.WR_DOMAIN && env.WR_HOSTED_ZONE_ID
      ? { name: env.WR_DOMAIN, hostedZoneId: env.WR_HOSTED_ZONE_ID }
      : undefined;
  const appUrls = list(env.WR_APP_URLS ?? 'http://localhost:5173');
  if (domain && !appUrls.includes(`https://${domain.name}`)) appUrls.push(`https://${domain.name}`);
  const plan = env.WR_ACCOUNT_PLAN ?? 'free';
  if (plan !== 'free' && plan !== 'paid') throw new Error('infra: WR_ACCOUNT_PLAN is free or paid');
  return {
    region: env.WR_AWS_REGION ?? 'us-east-2',
    accountPlan: plan,
    alertEmail: need('WR_ALERT_EMAIL'),
    senderEmail: need('WR_SENDER_EMAIL'),
    fromEmail: domain ? `no-reply@${domain.name}` : need('WR_SENDER_EMAIL'),
    testRecipients: list(need('WR_TEST_RECIPIENTS')),
    domainPrefix: need('WR_COGNITO_DOMAIN_PREFIX'),
    appUrls,
    ...(env.WR_DOMAIN ? { zoneName: env.WR_DOMAIN } : {}),
    ...(domain ? { domain } : {}),
    ...(env.WR_GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: env.WR_GOOGLE_CLIENT_ID,
            secretName: env.WR_GOOGLE_SECRET_NAME ?? 'wr/google-oauth',
          },
        }
      : {}),
  };
}
