// The app: who's signed in, and which page the URL names (D-048's tiny router). Signed in, Home
// and the open script are two layers that crossfade (the handoff, SPEC 3.10).
import { colorFor } from '@wr/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiFailure, api, publicApi } from './api';
import { ScriptScreen } from './App';
import { auth, useAuth, type Me } from './auth';
import { ToastProvider, useToast } from './components/Toast';
import { HomeScreen } from './home/HomeScreen';
import { useHome } from './home/useHome';
import { localCopies } from './localCopies';
import { Privacy, Terms } from './pages/Legal';
import { SignIn, type InvitePreview } from './pages/SignIn';
import { navigate, useRoute, type Route } from './router';
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
  if (state.status === 'signedOut')
    return route.name === 'invite' ? <InvitationSignIn token={route.token} /> : <SignIn />;
  return <SignedIn route={route} me={state.me} syncUrls={syncUrls} />;
}

/** /i/<token>, signed out: "Join Fogline" (D-028, D-032). Accepting happens once signed in. */
function InvitationSignIn({ token }: { token: string }) {
  const toast = useToast();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
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
  return preview ? <SignIn invite={preview} /> : null;
}

function SignedIn({
  route,
  me,
  syncUrls,
}: {
  route: Route;
  me: Me;
  syncUrls: string | readonly string[];
}) {
  const { data, reload } = useHome();
  const [select, setSelect] = useState<string | null>(null);
  const onEpisode = route.name === 'episode';

  // The script layer stays mounted while it fades out after "back", then goes.
  const [shown, setShown] = useState<string | null>(onEpisode ? route.id : null);
  if (onEpisode && route.id !== shown) setShown(route.id);
  useEffect(() => {
    if (onEpisode) return;
    const t = setTimeout(() => setShown(null), 260);
    return () => clearTimeout(t);
  }, [onEpisode]);

  return (
    <div className="layers">
      <div className={`layer${onEpisode ? ' off to-left' : ''}`}>
        <HomeScreen me={me} data={data} reload={reload} select={select} />
      </div>
      {shown && (
        <Layer visible={onEpisode}>
          <Episode key={shown} id={shown} me={me} syncUrls={syncUrls} onChanged={reload} />
        </Layer>
      )}
      {route.name === 'invite' && (
        <AcceptInvitation
          token={route.token}
          onJoined={(seriesId) => {
            setSelect(seriesId);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** A layer that fades in on its first frame, so opening a script crossfades too. */
function Layer({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className={`layer${visible && ready ? '' : ' off to-right'}`}>{children}</div>;
}

/** /i/<token>, signed in: join, then show the series on Home. */
function AcceptInvitation({ token, onJoined }: { token: string; onJoined: (id: string) => void }) {
  const toast = useToast();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ seriesId: string; seriesName: string }>('POST', '/api/invitations/accept', {
      token,
    }).then(
      (r) => {
        onJoined(r.seriesId);
        toast.show(`You joined ${r.seriesName}`);
        navigate('/', { replace: true });
      },
      (err: unknown) => {
        toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t accept the invitation.');
        navigate('/', { replace: true });
      },
    );
  }, [token, toast, onJoined]);
  return null;
}

interface OpenedEpisode {
  id: string;
  name: string;
  number: number;
  series: { id: string; name: string; isSeries: boolean };
  role: 'showrunner' | 'writer' | 'viewer';
  canEdit: boolean;
  draftId: string;
}

/** /e/<id>: the script screen on the episode's main draft, as this person (D-046). */
function Episode({
  id,
  me,
  syncUrls,
  onChanged,
}: {
  id: string;
  me: Me;
  syncUrls: string | readonly string[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [episode, setEpisode] = useState<OpenedEpisode | null>(null);
  // A script made with + New script / + New episode opens with its title ready to type (D-033).
  const [isNew] = useState(() => new URLSearchParams(location.search).get('new') === '1');

  useEffect(() => {
    let live = true;
    if (isNew) history.replaceState(null, '', location.pathname);
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
  }, [id, toast, isNew]);

  const session = useMemo<Session | null>(
    () =>
      episode && {
        serverUrl: syncUrls,
        docId: episode.draftId,
        identity: { userId: me.id, name: me.name, color: colorFor(me.id) },
        token: auth.token,
        canEdit: episode.canEdit,
      },
    [episode, me, syncUrls],
  );

  /** The server closed us for good (D-046): access changed, or the episode was deleted. */
  const onFatal = async (reason: string) => {
    if (!episode) return;
    if (reason === 'deleted' || reason === 'bad episode') {
      toast.show(
        reason === 'deleted'
          ? 'This episode was deleted by the showrunner.'
          : 'That episode isn’t available.',
      );
      onChanged();
      return navigate('/', { replace: true });
    }
    if (reason !== 'forbidden') return; // 'unauthorized': the sign-in state takes over
    let now: OpenedEpisode;
    try {
      now = await api<OpenedEpisode>('GET', `/api/episodes/${id}`);
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'You no longer have access.');
      onChanged();
      return navigate('/', { replace: true });
    }
    // Reload the server's version in the new mode. Losing edit access discards edits the
    // server never accepted (D-046), so this device's copy goes too.
    setEpisode(null);
    if (!now.canEdit) await localCopies.clear(episode.draftId);
    toast.show(
      now.canEdit
        ? 'You can edit this episode now.'
        : 'Your access changed. Edits since then weren’t saved.',
    );
    setEpisode(now);
  };

  if (!session || !episode) return null;
  const prefix = episode.series.isSeries ? `Ep ${episode.number} · ` : '';
  return (
    <ScriptScreen
      session={session}
      onBack={() => navigate('/')}
      share={{
        episodeId: episode.id,
        seriesId: episode.series.id,
        label: prefix + episode.name,
        canEdit: episode.canEdit,
        showrunner: episode.role === 'showrunner',
        me: me.id,
      }}
      onFatal={(r) => void onFatal(r)}
      exportInfo={{
        title: episode.series.isSeries ? episode.series.name : episode.name,
        ...(episode.series.isSeries ? { episode: episode.name } : {}),
        fileParts: episode.series.isSeries
          ? [episode.series.name, `Ep ${episode.number}`, episode.name]
          : [episode.name],
        // "Written by": the episode's writers, or the showrunners if nobody is assigned.
        writers: async () => {
          const { members } = await api<{
            members: { name: string; role: string; episodes: string[] }[];
          }>('GET', `/api/series/${episode.series.id}/members`);
          const assigned = members.filter((m) => m.episodes.includes(episode.id));
          return (assigned.length ? assigned : members.filter((m) => m.role === 'showrunner')).map(
            (m) => m.name,
          );
        },
      }}
      title={{
        text: prefix + episode.name,
        value: episode.name,
        prefix,
        canEdit: episode.canEdit,
        startRenaming: isNew,
        onRename: (name) => {
          setEpisode({ ...episode, name });
          api('PATCH', `/api/episodes/${id}`, { name }).then(onChanged, (err: unknown) =>
            toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t rename it.'),
          );
        },
      }}
    />
  );
}
