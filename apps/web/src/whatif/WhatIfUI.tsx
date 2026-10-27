// The what-if UI from prototype v2 (SPEC 3.6, 3.9; D-080): Review all, the Compare panel, the
// Drafts tab, and the Scenes tab's markers. Wording and sizes are the prototype's.
import {
  diffWords,
  pendingScenes,
  sceneName,
  type Comparison,
  type SceneState,
  type ScriptBlock,
} from '@wr/schema';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icons';
import { RowsSkeleton } from '../components/Skeleton';
import { TextAction } from '../components/TextAction';
import { when, type DraftInfo, type SnapshotInfo } from './drafts';
import './whatif.css';
import type { SceneEdit } from './sceneEdits';

/** What the script screen knows about the episode's drafts (from Root). */
export interface DraftsContext {
  episodeId: string;
  list: DraftInfo[];
  current: DraftInfo;
  me: { id: string; name: string };
  /** Renaming and deleting what-ifs: whoever started one, or the showrunner (D-080). */
  canManage: (d: DraftInfo) => boolean;
  reload: () => void;
  /** null = main. */
  open: (draftId: string | null) => void;
}

const pending = (s: SceneState | undefined) => s?.status === 'differs' || s?.status === 'conflict';

// ---- Review all (SPEC 3.9) ----

export function ReviewMenu({
  comparison,
  onSend,
  onCompare,
  onClose,
}: {
  comparison: Comparison | null;
  onSend: (ids: string[]) => void;
  onCompare: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = comparison ? pendingScenes(comparison) : [];
  // Blue rows start checked; amber ones are never sent blind (they get Compare instead).
  const [checked, setChecked] = useState(
    () => new Set(rows.filter((s) => s.status === 'differs').map((s) => s.id)),
  );
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (
        !ref.current?.contains(e.target as Node) &&
        !(e.target as Element).closest?.('[data-review]')
      )
        onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', outside));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', outside);
    };
  }, [onClose]);
  const ids = rows.filter((s) => checked.has(s.id)).map((s) => s.id);
  return (
    <div
      ref={ref}
      className="menu below rv"
      role="menu"
      aria-label="Send changes to main"
      style={{ right: 0 }}
    >
      <div className="lab" style={{ padding: '8px 10px 6px' }}>
        SEND TO MAIN
      </div>
      {rows.length ? (
        <>
          {rows.map((s) =>
            s.status === 'conflict' ? (
              <div key={s.id} className="mi rvr">
                <span className="rvn">
                  <span className="nd amber" role="img" aria-label="Main changed this scene too">
                    ●
                  </span>
                  {label(s)}
                </span>
                <TextAction label="Compare" onClick={() => onCompare(s.id)} />
              </div>
            ) : (
              <button
                key={s.id}
                type="button"
                className="mi rvr"
                role="menuitemcheckbox"
                aria-checked={checked.has(s.id)}
                onClick={() =>
                  setChecked((c) => {
                    const n = new Set(c);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })
                }
              >
                <span className="rvn">
                  <span className="nd blue" role="img" aria-label="Differs from main">
                    ●
                  </span>
                  {label(s)}
                </span>
                <span className="ck">{checked.has(s.id) ? '✓' : ''}</span>
              </button>
            ),
          )}
          <div className="sep" role="separator" />
          <button
            type="button"
            className="mi send"
            disabled={!ids.length}
            onClick={() => ids.length && onSend(ids)}
          >
            {ids.length
              ? `Send ${ids.length} scene${ids.length === 1 ? '' : 's'}`
              : 'Select scenes to send'}
          </button>
        </>
      ) : (
        <div className="mi" style={{ color: 'var(--muted)' }}>
          Everything’s in main
        </div>
      )}
    </div>
  );
}

/** A scene's name in lists; a scene the what-if deleted says so. */
const label = (s: SceneState) =>
  `${sceneName(s.heading)}${s.change === 'deleted' ? ' (deleted)' : ''}`;

// ---- Compare (SPEC 3.9) ----

const CLASS: Record<string, string> = {
  scene_heading: 'h',
  action: 'a',
  character: 'c',
  parenthetical: 'p',
  dialogue: 'd',
  transition: 't',
  shot: 'h',
};

export function ComparePanel({
  scene,
  mainScene,
  base,
  lastEdit,
  canSend,
  onSend,
  onClose,
  loading = false,
}: {
  /** Main and the base haven't arrived yet (D-084). */
  loading?: boolean;
  scene: SceneState | null;
  mainScene: ScriptBlock[] | null;
  base: ScriptBlock[] | null;
  lastEdit: SceneEdit | null;
  canSend: boolean;
  onSend: (id: string) => void;
  onClose: () => void;
}) {
  const changedInMain =
    !!mainScene &&
    JSON.stringify((base ?? []).map((b) => [b.type, b.text])) !==
      JSON.stringify(mainScene.map((b) => [b.type, b.text]));
  const baseById = new Map((base ?? []).map((b) => [b.id, b]));
  let body;
  if (loading) body = <RowsSkeleton widths={['70%', '90%', '55%']} />;
  else if (!scene)
    body = <p className="empty">Put your cursor in a scene to see main’s version of it.</p>;
  else if (!pending(scene))
    body = (
      <p className="empty">
        {scene.status === 'sent'
          ? 'This scene was sent. It matches main now.'
          : 'This scene matches main.'}
      </p>
    );
  else if (!mainScene) body = <p className="empty">This scene isn’t in main yet.</p>;
  else
    body = (
      <>
        <div className="pv">
          {mainScene.map((b) => {
            const old = baseById.get(b.id);
            const parts = changedInMain
              ? old
                ? diffWords(old.text, b.text).filter((p) => p.op !== 'del')
                : [{ op: 'ins' as const, text: b.text }]
              : [{ op: 'same' as const, text: b.text }];
            return (
              <div key={b.id} className={`b ${CLASS[b.type]}`}>
                {parts.map((p, i) =>
                  p.op === 'ins' ? <ins key={i}>{p.text}</ins> : <span key={i}>{p.text}</span>,
                )}
              </div>
            );
          })}
        </div>
        <p className="note">
          {changedInMain
            ? `Highlights show what ${lastEdit?.by ?? 'main'} added since this what-if began.`
            : 'Main hasn’t changed this scene since your what-if began.'}
        </p>
      </>
    );
  return (
    <div className="rp">
      <div className="rh">
        <span>
          <b>Main’s version</b>
          <small>
            {scene ? sceneName(scene.heading) : ''}
            {scene && pending(scene) && changedInMain && lastEdit
              ? ` · changed by ${lastEdit.by}, ${when(new Date(lastEdit.at).toISOString())}`
              : ''}
          </small>
        </span>
        <button
          type="button"
          className="ib"
          title="Close compare"
          aria-label="Close compare"
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="rb cv">{body}</div>
      <div className="rf">
        <small style={{ margin: 0 }}>Esc to close</small>
        {scene && pending(scene) && canSend && (
          <button type="button" className="pb" onClick={() => onSend(scene.id)}>
            Send mine to main
          </button>
        )}
      </div>
    </div>
  );
}

// ---- The Drafts tab (SPEC 3.6) ----

export function DraftsTab({
  drafts,
  people,
  canEdit,
  liveDiffer,
  snapshots,
  onNewWhatIf,
  onSnapshot,
  onRestore,
  onDelete,
}: {
  drafts: DraftsContext;
  /** Who's in main right now. */
  people: string[];
  canEdit: boolean;
  /** The open what-if's live count. */
  liveDiffer: number | null;
  /** Null while they load (D-084). */
  snapshots: SnapshotInfo[] | null;
  onNewWhatIf: () => void;
  onSnapshot: () => void;
  onRestore: (s: SnapshotInfo) => void;
  onDelete: (d: DraftInfo) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const onMain = drafts.current.kind === 'main';
  const whatIfs = drafts.list.filter((d) => d.kind === 'whatif');
  const meta = (d: DraftInfo) => {
    const who = d.createdBy?.id === drafts.me.id ? 'you' : (d.createdBy?.name ?? 'someone');
    const n = d.id === drafts.current.id && liveDiffer !== null ? liveDiffer : d.scenesDiffer;
    return `${who} · ${when(d.createdAt)} · ${n ? `${n} scene${n === 1 ? '' : 's'} differ${n === 1 ? 's' : ''}` : 'no changes yet'}`;
  };
  return (
    <div role="tabpanel" aria-label="Drafts">
      <div className="list">
        <button
          type="button"
          className={`row big${onMain ? ' sel' : ''}`}
          onClick={() => drafts.open(null)}
        >
          <span>
            <span style={{ fontWeight: 600 }}>Main</span>
            <small>
              {people.length ? `Editing now · ${people.join(', ')}` : 'Nobody editing now'}
            </small>
          </span>
        </button>
        {canEdit && (
          <div className="act">
            <TextAction label="+ New what-if" onClick={onNewWhatIf} />
          </div>
        )}
      </div>
      <div className="lab">WHAT-IFS</div>
      <div className="list" style={{ paddingTop: 0 }}>
        {whatIfs.length === 0 && (
          <p className="none">
            No what-ifs yet.{canEdit ? ' Try an idea with + New what‑if.' : ''}
          </p>
        )}
        {whatIfs.map((d) =>
          deleting === d.id ? (
            <div key={d.id} className="row big cf cfs">
              <span className="cfq">Delete “{d.name}” for everyone?</span>
              <span className="cfa">
                <TextAction
                  label="Delete"
                  className="del"
                  onClick={() => {
                    setDeleting(null);
                    onDelete(d);
                  }}
                />
                <TextAction label="Cancel" onClick={() => setDeleting(null)} />
              </span>
            </div>
          ) : (
            <div
              key={d.id}
              className={`row big${drafts.canManage(d) ? ' hasx' : ''}${d.id === drafts.current.id ? ' sel' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => drafts.open(d.id)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                  e.preventDefault();
                  drafts.open(d.id);
                }
              }}
            >
              <span>
                {d.name}
                <small>{meta(d)}</small>
              </span>
              {drafts.canManage(d) && (
                <button
                  type="button"
                  className="rx"
                  title="Delete"
                  aria-label={`Delete ${d.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(d.id);
                  }}
                >
                  <Icon name="x" />
                </button>
              )}
            </div>
          ),
        )}
      </div>
      <div className="lab r">
        <span>SNAPSHOTS</span>
        {canEdit && <TextAction label="+ Snapshot" onClick={onSnapshot} />}
      </div>
      {!snapshots && <RowsSkeleton widths={['60%', '45%']} />}
      <div className="list" style={{ paddingTop: 0 }}>
        {snapshots?.length === 0 && <p className="none">No snapshots yet.</p>}
        {(snapshots ?? []).map((s) =>
          confirming === s.id ? (
            <div key={s.id} className="snap cf">
              <span className="cfq">
                Restore “{s.label}”? Your draft as it is now is kept as a snapshot first.
              </span>
              <span className="cfa">
                <TextAction
                  label="Restore"
                  onClick={() => {
                    setConfirming(null);
                    onRestore(s);
                  }}
                />
                <TextAction label="Cancel" onClick={() => setConfirming(null)} />
              </span>
            </div>
          ) : (
            <button
              key={s.id}
              type="button"
              className="snap"
              disabled={!canEdit}
              title={canEdit ? 'Restore this snapshot' : undefined}
              onClick={() => setConfirming(s.id)}
            >
              {s.label}
              <small>
                {when(s.createdAt)} ·{' '}
                {s.kind === 'automatic'
                  ? 'automatic'
                  : s.createdBy?.id === drafts.me.id
                    ? 'you'
                    : (s.createdBy?.name ?? 'someone')}
              </small>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// ---- The Scenes tab's markers (SPEC 3.6) ----

export function SceneMarker({ state }: { state: SceneState | undefined }) {
  if (!state) return null;
  if (state.status === 'sent') return <small style={{ margin: 0 }}>Sent ✓</small>;
  if (pending(state))
    return state.status === 'conflict' ? (
      <span className="nd amber" role="img" aria-label="Main changed this scene too">
        ●
      </span>
    ) : (
      <span className="nd blue" role="img" aria-label="Differs from main">
        ●
      </span>
    );
  return null;
}

export function Legend() {
  return (
    <div className="legend">
      <span className="nd blue" aria-hidden="true">
        ●
      </span>{' '}
      differs from main &nbsp;{' '}
      <span className="nd amber" aria-hidden="true">
        ●
      </span>{' '}
      main changed too
    </div>
  );
}
