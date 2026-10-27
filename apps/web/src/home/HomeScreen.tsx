// The home page (SPEC 3.10, prototype v2): RECENT, SCRIPTS, SERIES, INVITATIONS and RECENTLY
// DELETED in the sidebar; the selected series' episodes in the 760 px column; Members on the
// right. Showrunners delete with a hover × and an inline confirm (D-037, D-051).
import { paginate } from '@wr/pagination';
import { colorFor } from '@wr/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure, api } from '../api';
import { auth, type Me } from '../auth';
import { Icon } from '../components/Icons';
import { PanelBoundary } from '../components/Boundary';
import { RenameTitle } from '../components/RenameTitle';
import { EpisodesSkeleton, RowsSkeleton } from '../components/Skeleton';
import { TextAction } from '../components/TextAction';
import { useToast } from '../components/Toast';
import { ImportError, parseScript, type ImportResult } from '../import/importScript';
import { pendingImports } from '../import/pending';
import { localCopies } from '../localCopies';
import { navigate } from '../router';
import { initials } from '../session';
import { toggleTheme, useTheme } from '../theme';
import { countUsage } from '../usage';
import { MembersPanel } from './MembersPanel';
import {
  episodeLabel,
  rowMeta,
  seriesMeta,
  type HomeData,
  type HomeSeries,
  type TrashItem,
} from './useHome';
import './home.css';

interface Props {
  me: Me;
  data: HomeData | null;
  reload: () => void;
  /** The series to select (after accepting an invitation, say). */
  select?: string | null;
}

/** What the inline confirm is asking about (D-037). */
type Confirming = { kind: 'episode' | 'script' | 'series'; id: string; where: 'side' | 'home' };

export function HomeScreen({ me, data, reload, select }: Props) {
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [members, setMembers] = useState(false);
  const [confirm, setConfirm] = useState<Confirming | null>(null);

  // A series to show from outside (an invitation just accepted) selects it once.
  const [lastSelect, setLastSelect] = useState(select);
  if (select !== lastSelect) {
    setLastSelect(select);
    if (select) setSel(select);
  }
  const series = data?.series ?? [];
  const current = series.find((s) => s.id === sel) ?? series[0] ?? null;

  const fail = useCallback(
    (err: unknown) => toast.show(err instanceof ApiFailure ? err.message : 'Something went wrong.'),
    [toast],
  );
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        fail(err);
      }
      reload();
    },
    [fail, reload],
  );

  // Esc closes the topmost thing: the confirm, then the Members panel (SPEC 3.9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else if (members) setMembers(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, members]);

  const newScript = () =>
    void run(async () => {
      const r = await api<{ episodeId: string }>('POST', '/api/series', { kind: 'script' });
      navigate(`/e/${r.episodeId}?new=1`);
    });
  // Import (D-071, D-077): read the file here, create a plain script named after it, open it, and
  // let the editor write the blocks in. The toast says what came in and what didn't.
  const importFile = (file: File) =>
    void run(async () => {
      let result: ImportResult;
      try {
        result = parseScript(file.name, await file.text());
      } catch (err) {
        if (err instanceof ImportError) return toast.show(err.message);
        throw err;
      }
      const r = await api<{ episodeId: string }>('POST', '/api/series', {
        kind: 'script',
        name: result.title,
      });
      pendingImports.set(r.episodeId, result.blocks);
      countUsage('script_imported', r.episodeId);
      navigate(`/e/${r.episodeId}`);
      const pages = paginate(result.blocks.map((b, i) => ({ id: String(i), ...b }))).pages.length;
      toast.show(result.report.message(result.title, pages));
    });
  const newSeries = () =>
    void run(async () => {
      const r = await api<{ seriesId: string }>('POST', '/api/series', { kind: 'series' });
      setSel(r.seriesId);
      setRenaming(r.seriesId);
    });
  const newEpisode = (s: HomeSeries) =>
    void run(async () => {
      const r = await api<{ episodeId: string }>('POST', `/api/series/${s.id}/episodes`, {});
      navigate(`/e/${r.episodeId}?new=1`);
    });

  const remove = (c: Confirming) =>
    void run(async () => {
      const name =
        c.kind === 'episode'
          ? (() => {
              const s = series.find((x) => x.episodes.some((e) => e.id === c.id))!;
              return episodeLabel(
                s,
                s.episodes.find((e) => e.id === c.id)!,
              );
            })()
          : series.find((s) => s.id === c.id)?.name;
      await api('DELETE', c.kind === 'episode' ? `/api/episodes/${c.id}` : `/api/series/${c.id}`);
      setConfirm(null);
      if (c.kind !== 'episode' && current?.id === c.id) setSel(null);
      toast.show(`“${name}” deleted · restore it from Recently deleted for 30 days`);
    });

  const restore = (t: TrashItem) =>
    void run(async () => {
      await api(
        'POST',
        t.kind === 'episode' ? `/api/episodes/${t.id}/restore` : `/api/series/${t.id}/restore`,
      );
      toast.show(`“${t.kind === 'episode' ? `Ep ${t.number} · ${t.name}` : t.name}” restored`);
    });

  // "Accept" turns into "Accepted ✓", and the series moves into SERIES a moment later (prototype v2).
  const accept = (id: string, name: string) =>
    void run(async () => {
      const r = await api<{ seriesId: string }>('POST', `/api/invitations/${id}/accept`);
      await new Promise((ok) => setTimeout(ok, 800));
      setSel(r.seriesId);
      toast.show(`You joined ${name}`);
    });

  return (
    <div className={`app is-home${members ? ' right-open' : ''}`}>
      <HomeToolbar me={me} onNewScript={newScript} onNewSeries={newSeries} onImport={importFile} />
      <div className="body">
        <aside className="left" aria-label="Your scripts">
          <div className="in slide">
            <PanelBoundary>
              <Sidebar
                data={data}
                current={current}
                confirm={confirm}
                onSelect={(id) => {
                  setSel(id);
                  setConfirm(null);
                }}
                onAsk={setConfirm}
                onCancel={() => setConfirm(null)}
                onDelete={remove}
                onAccept={accept}
                onRestore={restore}
              />
            </PanelBoundary>
          </div>
        </aside>
        <main className="center">
          <div className="in slide">
            <div className="home">
              {!data ? (
                <EpisodesSkeleton />
              ) : !current ? (
                <div className="emptyh">
                  No scripts yet.
                  <br />
                  Start one with + New script.
                </div>
              ) : (
                <SeriesView
                  key={current.id}
                  s={current}
                  now={data.fetchedAt}
                  me={me}
                  renaming={renaming === current.id}
                  membersOpen={members}
                  confirm={confirm}
                  onRename={(name) =>
                    void run(async () => {
                      setRenaming(null);
                      await api('PATCH', `/api/series/${current.id}`, { name });
                    })
                  }
                  onNewEpisode={() => newEpisode(current)}
                  onMembers={() => setMembers((m) => !m)}
                  onAsk={setConfirm}
                  onCancel={() => setConfirm(null)}
                  onDelete={remove}
                />
              )}
            </div>
          </div>
        </main>
        <aside className="right" aria-label="Members">
          {current && members && (
            <PanelBoundary>
              <MembersPanel
                key={current.id}
                s={current}
                me={me}
                onClose={() => setMembers(false)}
                onChanged={reload}
              />
            </PanelBoundary>
          )}
        </aside>
      </div>
    </div>
  );
}

function HomeToolbar({
  me,
  onNewScript,
  onNewSeries,
  onImport,
}: {
  me: Me;
  onNewScript: () => void;
  onNewSeries: () => void;
  onImport: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  // Signing out clears this browser's script copies, but never silently loses edits (D-050).
  const signOut = async (force = false) => {
    if (!force && localCopies.unsynced().length)
      return toast.show(
        'Some edits haven’t reached the server yet. Signing out now would lose them.',
        [
          { label: 'Sign out anyway', run: () => void signOut(true) },
          { label: 'Cancel', run: () => {} },
        ],
      );
    await localCopies.clearAll();
    await auth.signOut();
  };

  return (
    <header className="toolbar home-tb">
      <div className="lgrp slide">
        <span className="title">Home</span>
      </div>
      <div className="grp slide" style={{ gap: 14 }}>
        <TextAction label="+ New series" className="hv tbh" onClick={onNewSeries} />
        <TextAction label="+ New script" className="hv tbh" onClick={onNewScript} />
        <TextAction label="Import" className="hv tbh" onClick={() => picker.current?.click()} />
        <input
          ref={picker}
          type="file"
          accept=".fdx,.fountain,.spmd,.txt"
          hidden
          aria-label="Import a Final Draft or Fountain script"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImport(file);
          }}
        />
        <button type="button" className="ib" title={label} aria-label={label} onClick={toggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <span className="anchor">
          <button
            type="button"
            className="ib"
            title="Account"
            aria-label="Account"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <span className={`av av-${colorFor(me.id) + 1}`} style={{ border: 0 }}>
              {initials(me.name)}
            </span>
          </button>
          {menu && (
            <AccountMenu me={me} onClose={() => setMenu(false)} onSignOut={() => void signOut()} />
          )}
        </span>
      </div>
    </header>
  );
}

function AccountMenu({
  me,
  onClose,
  onSignOut,
}: {
  me: Me;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.mi')?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', outside));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', outside);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="menu below"
      role="menu"
      aria-label="Account"
      style={{ right: 0 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="mh">
        {me.name}
        <small>{me.email}</small>
      </div>
      <div className="sep" role="separator" />
      <button
        type="button"
        className="mi"
        role="menuitem"
        onClick={() => {
          onClose();
          onSignOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

const X = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** The inline confirm's Cancel / Delete (D-037). `armed` false greys Delete until the name is typed. */
function ConfirmActions({
  onCancel,
  onDelete,
  armed = true,
  verb = 'Delete',
}: {
  onCancel: () => void;
  onDelete: () => void;
  armed?: boolean;
  verb?: string;
}) {
  return (
    <span className="cfa">
      <button type="button" className="ta" data-t="Cancel" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={`ta del${armed ? '' : ' dis'}`}
        data-t={verb}
        aria-disabled={!armed}
        onClick={() => armed && onDelete()}
      >
        {verb}
      </button>
    </span>
  );
}

function Sidebar({
  data,
  current,
  confirm,
  onSelect,
  onAsk,
  onCancel,
  onDelete,
  onAccept,
  onRestore,
}: {
  data: HomeData | null;
  current: HomeSeries | null;
  confirm: Confirming | null;
  onSelect: (id: string) => void;
  onAsk: (c: Confirming) => void;
  onCancel: () => void;
  onDelete: (c: Confirming) => void;
  onAccept: (id: string, name: string) => void;
  onRestore: (t: TrashItem) => void;
}) {
  const [typed, setTyped] = useState('');
  const [accepted, setAccepted] = useState<string[]>([]);
  if (!data) return <RowsSkeleton widths={['58%', '44%', '64%', '50%']} />;
  const series = data.series;
  const byEpisode = new Map(
    series.flatMap((s) => s.episodes.map((e) => [e.id, { s, e }] as const)),
  );
  const recent = data.recent.map((id) => byEpisode.get(id)).filter((x) => !!x);

  const row = (s: HomeSeries) => {
    const kind = s.isSeries ? 'series' : 'script';
    const asking = confirm?.where === 'side' && confirm.id === s.id;
    if (asking) {
      const n = s.episodes.length;
      return (
        <div key={s.id} className="row cf cfs">
          <span className="cfq">
            Delete “{s.name}”
            {kind === 'series' && n ? ` and its ${n} episode${n === 1 ? '' : 's'}` : ''} for
            everyone?
          </span>
          {kind === 'series' && (
            <input
              className="fld"
              autoFocus
              placeholder={`Type “${s.name}” to confirm`}
              aria-label="Type the series name to confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typed.trim() === s.name) onDelete(confirm);
              }}
            />
          )}
          <ConfirmActions
            onCancel={onCancel}
            onDelete={() => onDelete(confirm)}
            armed={kind === 'script' || typed.trim() === s.name}
          />
        </div>
      );
    }
    return (
      <div
        key={s.id}
        className={`row${s.role === 'showrunner' ? ' hasx' : ''}${current?.id === s.id ? ' sel' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(s.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(s.id);
        }}
      >
        <span className="nm">{s.name}</span>
        {s.role === 'showrunner' && (
          <button
            type="button"
            className="rx"
            title="Delete"
            aria-label={`Delete ${s.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setTyped('');
              onAsk({ kind, id: s.id, where: 'side' });
            }}
          >
            <X />
          </button>
        )}
      </div>
    );
  };

  const section = (label: string, rows: React.ReactNode[]) =>
    rows.length ? (
      <>
        <div className="lab">{label}</div>
        <div className="list" style={{ paddingTop: 0 }}>
          {rows}
        </div>
      </>
    ) : null;

  return (
    <>
      {section(
        'RECENT',
        recent.map(({ s, e }) => (
          <button key={e.id} type="button" className="row" onClick={() => navigate(`/e/${e.id}`)}>
            <span className="nm">{episodeLabel(s, e)}</span>
          </button>
        )),
      )}
      {section('SCRIPTS', series.filter((s) => !s.isSeries).map(row))}
      {section('SERIES', series.filter((s) => s.isSeries).map(row))}
      {section(
        'INVITATIONS',
        data.invitations.map((i) => (
          <div key={i.id} className="row" style={{ cursor: 'default' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              {i.seriesName}
              <small>from {i.from}</small>
            </span>
            <TextAction
              label={accepted.includes(i.id) ? 'Accepted ✓' : 'Accept'}
              reserve="Accepted ✓"
              hold={accepted.includes(i.id)}
              onClick={() => {
                if (accepted.includes(i.id)) return;
                setAccepted((a) => [...a, i.id]);
                onAccept(i.id, i.seriesName);
              }}
            />
          </div>
        )),
      )}
      {section(
        'RECENTLY DELETED',
        data.trash.map((t) => {
          const days = Math.max(
            1,
            30 - Math.floor((data.fetchedAt - Date.parse(t.deletedAt)) / 86_400_000),
          );
          const sub =
            t.kind === 'episode'
              ? t.seriesName
              : t.kind === 'series'
                ? `Series · ${t.episodes} episode${t.episodes === 1 ? '' : 's'}`
                : 'Script';
          return (
            <div key={`${t.kind}-${t.id}`} className="row" style={{ cursor: 'default' }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {t.kind === 'episode' ? `Ep ${t.number} · ${t.name}` : t.name}
                <small>
                  {sub} · {days} day{days === 1 ? '' : 's'} left
                </small>
              </span>
              <TextAction label="Restore" onClick={() => onRestore(t)} />
            </div>
          );
        }),
      )}
    </>
  );
}

function SeriesView({
  s,
  now,
  me,
  renaming,
  membersOpen,
  confirm,
  onRename,
  onNewEpisode,
  onMembers,
  onAsk,
  onCancel,
  onDelete,
}: {
  s: HomeSeries;
  now: number;
  me: Me;
  renaming: boolean;
  membersOpen: boolean;
  confirm: Confirming | null;
  onRename: (name: string) => void;
  onNewEpisode: () => void;
  onMembers: () => void;
  onAsk: (c: Confirming) => void;
  onCancel: () => void;
  onDelete: (c: Confirming) => void;
}) {
  const sr = s.role === 'showrunner';
  return (
    <>
      <div className="sh">
        <span>
          <RenameTitle
            text={s.name}
            value={s.name}
            canRename={sr}
            onSave={onRename}
            startEditing={renaming}
          />
          <small>{seriesMeta(s, me.id)}</small>
        </span>
        <span className="grp" style={{ gap: 16 }}>
          {sr && <TextAction label="+ New episode" className="hv" onClick={onNewEpisode} />}
          <TextAction label="Members" className="hv" hold={membersOpen} onClick={onMembers} />
        </span>
      </div>
      <div className="eps">
        {s.episodes.map((e) => {
          const kind = s.isSeries ? 'episode' : 'script';
          const id = s.isSeries ? e.id : s.id;
          const label = episodeLabel(s, e);
          if (confirm?.where === 'home' && confirm.id === id)
            return (
              <div key={e.id} className="ep cf">
                <span className="cfq">Delete “{label}” for everyone?</span>
                <ConfirmActions onCancel={onCancel} onDelete={() => onDelete(confirm)} />
              </div>
            );
          const meta = rowMeta(e, me.id, now);
          return (
            <div
              key={e.id}
              className={`ep${sr ? ' hasx' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/e/${e.id}`)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') navigate(`/e/${e.id}`);
              }}
            >
              <span className="nm">{label}</span>
              <span className="epr">
                <small>
                  {meta.live && <span className="live">● </span>}
                  {meta.text}
                </small>
                {sr && (
                  <button
                    type="button"
                    className="rx"
                    title="Delete"
                    aria-label={`Delete ${label}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onAsk({ kind, id, where: 'home' });
                    }}
                  >
                    <X />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {!s.episodes.length && (
        <div className="emptyh" style={{ paddingTop: 48 }}>
          No episodes yet.
          {sr && (
            <>
              <br />
              Add one with + New episode.
            </>
          )}
        </div>
      )}
    </>
  );
}
