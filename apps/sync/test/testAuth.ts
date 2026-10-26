// Sign-in for the sync server's tests (D-030, D-046): real token checks against a per-run test
// key, and the in-memory access source, where a token's subject is the writer's name.
import { tokenVerifier } from '@wr/auth';
import { createTestIssuer } from '@wr/auth/testing';
import { memoryAccess } from '../src/access';

export const issuer = await createTestIssuer();
export const CLUSTER_SECRET = 'test-cluster-secret';

/** What every test server needs to accept connections. */
export const testServerAuth = (access = memoryAccess()) => ({
  verify: tokenVerifier([issuer.trusted]),
  access,
  clusterSecret: CLUSTER_SECRET,
});

/** A fresh access token for `name`, on every (re)connect, as the browser does. */
export const tokenFor = (name: string) => () => issuer.sign(name);
