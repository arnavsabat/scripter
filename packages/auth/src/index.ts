// Sign-in token checks for the API and the sync servers (SPEC 5.6, D-030, D-031). Both verify the
// same thing the same way: a Cognito *access* token, signed by a key from the issuer's published
// key set, for our app client, and not expired. Anything else is refused.
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface TrustedIssuer {
  /** The token's `iss` claim must equal this exactly. */
  issuer: string;
  /** Cognito puts the app client in `client_id` (access tokens carry no `aud`). */
  clientId: string;
  /** Where the issuer's public signing keys come from (fetched once, then cached by jose). */
  keys: JWTVerifyGetKey;
}

export interface VerifiedToken {
  /** The Cognito user: one per sign-in method, linked to a person by user_identities (D-041). */
  sub: string;
  issuer: string;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken | null>;

/** The issuer for a Cognito user pool, with its keys fetched from the pool's JWKS URL. */
export function cognitoIssuer(region: string, userPoolId: string, clientId: string): TrustedIssuer {
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  return {
    issuer,
    clientId,
    keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
  };
}

/** Builds the check. Production passes only the Cognito issuer; tests pass only a test issuer. */
export function tokenVerifier(issuers: readonly TrustedIssuer[]): TokenVerifier {
  return async (token) => {
    let iss: unknown;
    try {
      iss = decodeJwt(token).iss; // unverified: only used to pick which key set to check against
    } catch {
      return null;
    }
    const trusted = issuers.find((i) => i.issuer === iss);
    if (!trusted) return null;
    try {
      const { payload } = await jwtVerify(token, trusted.keys, {
        issuer: trusted.issuer,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (payload.token_use !== 'access') return null; // an ID or refresh token isn't a pass
      if (payload.client_id !== trusted.clientId) return null; // issued to some other app
      if (typeof payload.sub !== 'string' || !payload.sub) return null;
      return { sub: payload.sub, issuer: trusted.issuer };
    } catch {
      return null; // bad signature, expired, not yet valid, wrong algorithm…
    }
  };
}

/** What the API reads from Cognito's ID token at sign-in, to link the sign-in to a person (D-041). */
export interface IdClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  /** Google gives a name; an email-code sign-up has none until the writer types one. */
  name: string | null;
  provider: 'google' | 'email';
}

export type IdTokenVerifier = (token: string) => Promise<IdClaims | null>;

/**
 * ID tokens are checked like access tokens, but they're addressed to our app client in `aud`
 * and carry `token_use: "id"`. Only the API reads them (once, at sign-in); the browser never sees one.
 */
export function idTokenVerifier(issuer: TrustedIssuer): IdTokenVerifier {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, issuer.keys, {
        issuer: issuer.issuer,
        audience: issuer.clientId,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      const { sub, email } = payload;
      if (payload.token_use !== 'id' || typeof sub !== 'string' || typeof email !== 'string')
        return null;
      const verified = payload.email_verified;
      const identities = payload.identities;
      const google =
        Array.isArray(identities) &&
        identities.some(
          (i) =>
            typeof i === 'object' &&
            i !== null &&
            (i as { providerName?: unknown }).providerName === 'Google',
        );
      return {
        sub,
        email,
        emailVerified: verified === true || verified === 'true',
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
        provider: google ? 'google' : 'email',
      };
    } catch {
      return null;
    }
  };
}
