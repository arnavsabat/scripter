// "Try a demo script" (D-108): a guest signs in, gets their own copy of one scene, and lands in it.
// The scene is written into the new script the way an import is (D-077), so it's real script
// text in a real document: everything a guest does is the product working, not a mock-up.
import { ApiFailure, publicApi } from '../api';
import { auth, type SignedIn } from '../auth';
import { parseFountain } from '../import/importScript';
import { pendingImports } from '../import/pending';
import { navigate } from '../router';
import source from './avengers-scene-80.fountain?raw';

/** Shown as the demo opens: whose scene it is, and how long the copy lasts. */
export const DEMO_CREDIT =
  'A scene from Marvel’s The Avengers (2012) by Joss Whedon. Your demo lasts 24 hours.';

export const demoScript = () => parseFountain(source, 'The Avengers (excerpt)');

/** Signs in as a guest, creates the demo script, opens it. */
export async function startDemo(): Promise<void> {
  const s = await publicApi<SignedIn>('POST', '/api/auth/guest');
  const demo = demoScript();
  // Created with the new token before the app switches to signed in, so it opens straight into
  // the script rather than passing through Home.
  const res = await fetch('/api/series', {
    method: 'POST',
    headers: { authorization: `Bearer ${s.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'script', name: demo.title }),
  });
  if (!res.ok)
    throw new ApiFailure(res.status, 'error', 'The demo didn’t start. Please try again.');
  const { episodeId } = (await res.json()) as { episodeId: string };
  pendingImports.set(episodeId, demo.blocks);
  navigate(`/e/${episodeId}`);
  auth.signedIn(s);
}
