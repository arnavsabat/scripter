// Verifies the token presented on connect (SPEC 5.4, 5.6; D-030, D-046): a Cognito access token,
// checked by @wr/auth and linked to a person by the access source. There is no development stub.
import type { TokenVerifier } from '@wr/auth';
import type { Identity } from '@wr/shared';
import type { AccessSource } from './access';

export async function authenticate(
  token: string,
  verify: TokenVerifier,
  access: AccessSource,
): Promise<Identity | null> {
  if (!token) return null;
  const verified = await verify(token);
  return verified ? access.identify(verified.sub) : null;
}
