// The app: who's signed in, and which page the URL names (D-048's tiny router).
import { colorFor } from '@wr/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiFailure, api, publicApi } from './api';
import { ScriptScreen } from './App';
import { auth, useAuth, type Me } from './auth';
import { ToastProvider, useToast } from './components/Toast';
import { Privacy, Terms } from './pages/Legal';
import { SignIn, type InvitePreview } from './pages/SignIn';
import { navigate, useRoute } from './router';
import type { Session } from './session';

export function Root({ syncUrls }: { syncUrls: string | readonly string[] }) {
  return (
    <ToastProvider>
      <Pages syncUrls={syncUrls} />
    </ToastProvider>
  );
}

function Pages({ syncUrls }: { syncUrls: string | readonly string[] }) {
  const route = useRoute();
  const state = useAuth();
  const toast = useToast();

  useEffect(() => {
    auth.start();
    // Back from a Google round trip that didn't work (D-044).
    if (new URLSearchParams(location.search).get('signin') === 'failed') {
      toast.show('Google sign-in didn’t work. Please try again.');
      history.replaceState(null, '', location.pathname);
    }
  }, [toast]);

  if (route.name === 'terms') return <Terms />;
  if (route.name === 'privacy') return <Privacy />;
  if (state.status === 'loading') return null;
  if (route.name === 'invite')
    return <Invitation token={route.token} signedIn={state.status === 'signedIn'} />;
  if (state.status === 'signedOut') return <SignIn />;
  if (route.name === 'episode')
    return <Episode key={route.id} id={route.id} me={state.me} syncUrls={syncUrls} />;
  return <HomeSoon me={state.me} />;
}

/** /i/<token> from an invitation email (D-032): sign in if needed, then join. */
function Invitation({ token, signedIn }: { token: string; signedIn: boolean }) {
  const toast = useToast();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const accepting = useRef(false);

  useEffect(() => {
    let live = true;
    publicApi<InvitePreview>('GET', `/api/invitations/preview?token=${token}`).then(
      (p) => {
        if (live) setPreview(p);
      },
      (err: unknown) => {
        if (!live) return;
        toast.show(err instanceof ApiFailure ? err.message : 'This invitation link isn’t valid.');
        navigate('/', { replace: true });
      },
    );
    return () => {
      live = false;
    };
  }, [token, toast]);

  useEffect(() => {
    if (!signedIn || accepting.current) return;
    accepting.current = true;
    api<{ seriesName: string }>('POST', '/api/invitations/accept', { token }).then(
      (r) => {
        toast.show(`You joined ${r.seriesName}`);
        navigate('/', { replace: true });
      },
      (err: unknown) => {
        toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t accept the invitation.');
        navigate('/', { replace: true });
      },
    );
  }, [signedIn, token, toast]);

  if (signedIn || !preview) return null;
  return <SignIn invite={preview} />;
}

interface OpenedEpisode {
  draftId: string;
  name: string;
  canEdit: boolean;
}

/** /e/<id>: the script screen, connected to the episode's main draft as this person. */
function Episode({
  id,
  me,
  syncUrls,
}: {
  id: string;
  me: Me;
  syncUrls: string | readonly string[];
}) {
  const toast = useToast();
  const [episode, setEpisode] = useState<OpenedEpisode | null>(null);

  useEffect(() => {
    let live = true;
    api<OpenedEpisode>('GET', `/api/episodes/${id}`).then(
      (e) => {
        if (live) setEpisode(e);
      },
      (err: unknown) => {
        if (!live) return;
        toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t open that episode.');
        navigate('/', { replace: true });
      },
    );
    return () => {
      live = false;
    };
  }, [id, toast]);

  const session = useMemo<Session | null>(
    () =>
      episode && {
        serverUrl: syncUrls,
        docId: episode.draftId,
        identity: { userId: me.id, name: me.name, color: colorFor(me.id) },
        token: auth.token,
      },
    [episode, me, syncUrls],
  );
  return session ? <ScriptScreen session={session} /> : null;
}

/** Until the home page lands (accounts step 6). */
function HomeSoon({ me }: { me: Me }) {
  return (
    <div className="si-page">
      <p style={{ textAlign: 'center', paddingTop: 96, fontSize: 13, color: 'var(--muted)' }}>
        Signed in as {me.name}. The home page arrives in the next step.{' '}
        <button type="button" className="ta" data-t="Sign out" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      </p>
    </div>
  );
}
