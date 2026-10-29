// The script-screen toolbar (SPEC 3.5): back, sidebar toggle and title on the left (no draft
// switcher since D-109: what-ifs are entered and renamed in the Drafts tab); presence, divider and
// Share on the right. Every icon has a hover label and an aria-label.
import type { Cue } from '@wr/shared';
import type { Overlay } from '../App';
import type { PresenceUser } from '../editor/presence';
import { initials } from '../session';
import type { ReactNode } from 'react';
import { PanelBoundary } from './Boundary';
import { CoWriterMenu, type ShareContext } from './CoWriterMenu';
import { Icon } from './Icons';
import { Menu } from './Menu';
import { RenameTitle } from './RenameTitle';
import { useToast } from './Toast';

/** The episode this toolbar names (D-033): its title, and whether it can be renamed here. */
export interface EpisodeTitle {
  text: string;
  value: string;
  prefix: string;
  canEdit: boolean;
  onRename: (name: string) => void;
  startRenaming?: boolean;
}

interface Props {
  title: string | EpisodeTitle;
  onBack?: () => void;
  share?: ShareContext;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  /** Co-writers in this episode right now (SPEC 3.5 presence avatars). */
  others: PresenceUser[];
  cue: Cue;
  /** Share › Export PDF (D-071): anyone who can open the script, viewers included. */
  onExport?: () => void;
  /** Inside a what-if only: the Changes toggle and Review all (SPEC 3.9). */
  whatIf?: { changes: boolean; onToggleChanges: () => void; review: ReactNode | null };
}

const CUE_TEXT = {
  offline: 'Offline',
  reconnecting: 'Reconnecting…',
  syncing: 'Syncing…',
} as const;
const CUE_HINT = 'Your edits are saved on this device and will merge when you reconnect.';

export function Toolbar({
  title,
  onBack,
  share,
  sidebarOpen,
  onToggleSidebar,
  overlay,
  setOverlay,
  others,
  cue,
  onExport,
  whatIf,
}: Props) {
  const toast = useToast();
  const close = () => setOverlay(null);
  const toggle = (kind: 'share' | 'review') => setOverlay(overlay?.kind === kind ? null : { kind });

  return (
    <header className="toolbar">
      <div className="lgrp slide">
        <button
          type="button"
          className="ib"
          title="Back to home"
          aria-label="Back to home"
          onClick={() => (onBack ? onBack() : toast.show('Home isn’t available here'))}
        >
          <Icon name="back" />
        </button>
        <button
          type="button"
          className="ib"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-pressed={!sidebarOpen}
          onClick={onToggleSidebar}
        >
          <Icon name="side" />
        </button>
        {typeof title === 'string' ? (
          <span className="title">{title}</span>
        ) : (
          <RenameTitle
            text={title.text}
            value={title.value}
            prefix={title.prefix}
            canRename={title.canEdit}
            onSave={title.onRename}
            startEditing={!!title.startRenaming}
          />
        )}
        {typeof title !== 'string' && !title.canEdit && <span className="vo">View only</span>}
        {cue && (
          <span className="cue" title={CUE_HINT} role="status">
            {CUE_TEXT[cue]}
          </span>
        )}
      </div>
      <div className="grp slide">
        {others.length > 0 && (
          <span className="avatars" aria-label="Writing now">
            {others.map((u) => (
              <span
                key={u.userId}
                className={`av av-${(u.color % 3) + 1}`}
                title={u.name}
                aria-label={u.name}
              >
                {initials(u.name)}
              </span>
            ))}
          </span>
        )}
        {others.length > 0 && <span className="dv" aria-hidden="true" />}
        {whatIf && (
          <>
            <button
              type="button"
              className={`ib${whatIf.changes ? ' on' : ''}`}
              title="Show changes from main"
              aria-label="Show changes from main"
              aria-pressed={whatIf.changes}
              onClick={whatIf.onToggleChanges}
            >
              <Icon name="chg" />
            </button>
            <span className="anchor" data-review>
              <button
                type="button"
                className={`ib${overlay?.kind === 'review' ? ' on' : ''}`}
                title="Review all changes"
                aria-label="Review all changes"
                aria-haspopup="menu"
                aria-expanded={overlay?.kind === 'review'}
                onClick={() => toggle('review')}
              >
                <Icon name="rev" />
              </button>
              {overlay?.kind === 'review' && whatIf.review}
            </span>
          </>
        )}
        <button
          type="button"
          className={`ib${overlay?.kind === 'share' || overlay?.kind === 'cowriter' ? ' on' : ''}`}
          title="Share"
          aria-label="Share"
          aria-haspopup="menu"
          aria-expanded={overlay?.kind === 'share'}
          onClick={() => toggle('share')}
        >
          <Icon name="share" />
        </button>
        {overlay?.kind === 'share' && (
          <Menu
            label="Share"
            style={{ right: 0 }}
            onClose={close}
            items={[
              {
                // A link to this episode (D-032): members land in it; anyone else is told to ask.
                label: 'Copy invite link',
                onSelect: () => {
                  if (!share) return toast.show('Sharing needs an open episode');
                  const link = `${location.origin}/e/${share.episodeId}`;
                  // Only say "copied" when it was; otherwise show the link to copy by hand.
                  (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error())).then(
                    () => toast.show(`Link to “${share.label}” copied`),
                    () => toast.show(`Copy this link: ${link}`),
                  );
                },
              },
              ...(share?.canEdit
                ? [{ label: 'Invite co-writer…', onSelect: () => setOverlay({ kind: 'cowriter' }) }]
                : []),
              ...(onExport ? [{ label: 'Export PDF', separated: true, onSelect: onExport }] : []),
            ]}
          />
        )}
        {overlay?.kind === 'cowriter' && share && (
          <PanelBoundary quiet>
            <CoWriterMenu ctx={share} onClose={close} />
          </PanelBoundary>
        )}
      </div>
    </header>
  );
}
