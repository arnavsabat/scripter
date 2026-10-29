// TEST ONLY (D-030). A throwaway signing key, generated per test run, that issues tokens shaped
// like Cognito access tokens. Servers trust it only when a test builds them with it: no environment
// variable or setting can make a running server accept it.
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import type { TrustedIssuer } from './index';

export interface TestIssuer {
  trusted: TrustedIssuer;
  /** The public key, for a test that runs servers in other processes (the chaos suite). */
  publicJwk: JWK;
  /** A signed access token for `sub`. Overrides let tests forge the bad cases. */
  sign(
    sub: string,
    overrides?: { tokenUse?: string; clientId?: string; expiresIn?: string | number },
  ): Promise<string>;
  /** A signed ID token, shaped like Cognito's (Google sign-ins carry an `identities` claim). */
  signId(
    sub: string,
    claims: {
      email: string;
      emailVerified?: boolean;
      name?: string;
      google?: boolean;
      /** The app client it's addressed to (`aud`); the issuer's own by default. */
      clientId?: string;
    },
  ): Promise<string>;
}

export async function createTestIssuer(clientId = 'test-client'): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  return issuerFor(privateKey, await exportJWK(publicKey), clientId);
}

/**
 * A test issuer whose private half can travel to other processes and threads: the load-test
 * harness signs a token per simulated writer in each of its workers (D-092).
 */
export async function createPortableTestIssuer(
  clientId = 'test-client',
): Promise<TestIssuer & { privateJwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const issuer = issuerFor(privateKey, await exportJWK(publicKey), clientId);
  return { ...issuer, privateJwk: await exportJWK(privateKey) };
}

/** The same issuer, rebuilt from its keys in another process or thread. */
export async function testIssuerFromJwks(
  privateJwk: JWK,
  publicJwk: JWK,
  clientId = 'test-client',
): Promise<TestIssuer> {
  return issuerFor((await importJWK(privateJwk, 'RS256')) as CryptoKey, publicJwk, clientId);
}

function issuerFor(privateKey: CryptoKey, publicJwk: JWK, clientId: string): TestIssuer {
  const kid = 'test-key';
  const jwk = { ...publicJwk, kid, alg: 'RS256', use: 'sig' };
  const issuer = 'https://issuer.test.scripter.invalid';
  return {
    trusted: { issuer, clientIds: [clientId], keys: createLocalJWKSet({ keys: [jwk] }) },
    publicJwk: jwk,
    sign: (sub, o = {}) =>
      new SignJWT({ token_use: o.tokenUse ?? 'access', client_id: o.clientId ?? clientId })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(issuer)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(o.expiresIn ?? '1h')
        .sign(privateKey),
    signId: (sub, c) =>
      new SignJWT({
        token_use: 'id',
        email: c.email,
        email_verified: c.emailVerified ?? true,
        ...(c.name ? { name: c.name } : {}),
        ...(c.google ? { identities: [{ providerName: 'Google' }] } : {}),
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(issuer)
        .setAudience(c.clientId ?? clientId)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey),
  };
}

/** The issuer for a test key whose public half came from another process (see publicJwk). */
export function trustedTestKey(jwk: JWK, clientId = 'test-client'): TrustedIssuer {
  return {
    issuer: 'https://issuer.test.scripter.invalid',
    clientIds: [clientId],
    keys: createLocalJWKSet({ keys: [jwk] }),
  };
}
