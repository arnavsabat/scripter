// TEST ONLY (D-030). A throwaway signing key, generated per test run, that issues tokens shaped
// like Cognito access tokens. Servers trust it only when a test builds them with it: no environment
// variable or setting can make a running server accept it.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { TrustedIssuer } from './index';

export interface TestIssuer {
  trusted: TrustedIssuer;
  /** A signed access token for `sub`. Overrides let tests forge the bad cases. */
  sign(
    sub: string,
    overrides?: { tokenUse?: string; clientId?: string; expiresIn?: string | number },
  ): Promise<string>;
}

export async function createTestIssuer(clientId = 'test-client'): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const kid = 'test-key';
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const issuer = 'https://issuer.test.writers-room.invalid';
  return {
    trusted: { issuer, clientId, keys: createLocalJWKSet({ keys: [jwk] }) },
    sign: (sub, o = {}) =>
      new SignJWT({ token_use: o.tokenUse ?? 'access', client_id: o.clientId ?? clientId })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(issuer)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(o.expiresIn ?? '1h')
        .sign(privateKey),
  };
}
