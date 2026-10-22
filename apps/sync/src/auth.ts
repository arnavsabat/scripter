// Verifies the token presented on connect (SPEC 5.4, 5.6). Until Cognito exists, the only
// tokens are unsigned development tokens, accepted only when the server runs with WR_DEV_AUTH=1.
import { readDevToken, type Identity } from '@wr/shared';

export function authenticate(token: string, { devAuth }: { devAuth: boolean }): Identity | null {
  if (devAuth) return readDevToken(token);
  // Cognito JWT verification arrives with accounts; until then, refuse everything.
  return null;
}
