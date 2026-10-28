// Settings for the CDK app, from infra/.env.local (git-ignored: Arnav's addresses stay out of the
// public repo, D-054). See infra/.env.local.example for every setting.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface InfraConfig {
  /** us-east-2 (D-058; the free plan's organization policy forbids ca-central-1). */
  region: string;
  /** Budget alerts go here (D-038). */
  alertEmail: string;
  /** SES sender for sign-in codes and invitations, until the domain exists (D-038). */
  senderEmail: string;
  /** Addresses SES's sandbox may send to: the demo's accounts (D-054). */
  testRecipients: string[];
  /** Globally unique prefix for the Cognito sign-in domain (<prefix>.auth.<region>.amazoncognito.com). */
  domainPrefix: string;
  /** Where the web app runs; Google returns to <appUrl>/api/auth/google/callback. */
  appUrls: string[];
  /** The Google OAuth client, once created (step 8, part 2). */
  google?: { clientId: string; secretName: string };
  /** The beta's domain (D-082), once bought: its Route 53 hosted zone. Unset: CloudFront's address. */
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
  return {
    region: env.WR_AWS_REGION ?? 'us-east-2',
    alertEmail: need('WR_ALERT_EMAIL'),
    senderEmail: need('WR_SENDER_EMAIL'),
    testRecipients: list(need('WR_TEST_RECIPIENTS')),
    domainPrefix: need('WR_COGNITO_DOMAIN_PREFIX'),
    appUrls: list(env.WR_APP_URLS ?? 'http://localhost:5173'),
    ...(env.WR_DOMAIN
      ? { domain: { name: env.WR_DOMAIN, hostedZoneId: need('WR_HOSTED_ZONE_ID') } }
      : {}),
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
