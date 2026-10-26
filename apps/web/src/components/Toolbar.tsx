// The script-screen toolbar (SPEC 3.5): back, sidebar toggle, title, draft switcher on the left;
// presence, divider and Share on the right. Every icon has a hover label and an aria-label.
import type { Cue } from '@wr/shared';
import type { Overlay } from '../App';
import type { PresenceUser } from '../editor/presence';
import { initials } from '../session';
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
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  /** Co-writers in this episode right now (SPEC 3.5 presence avatars). */
  others: PresenceUser[];
  cue: Cue;
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
  sidebarOpen,
  onToggleSidebar,
  overlay,
  setOverlay,
  others,
  cue,
}: Props) {
  const toast = useToast();
  const close = () => setOverlay(null);
  const toggle = (kind: 'draft' | 'share') => setOverlay(overlay?.kind === kind ? null : { kind });

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
        <span className="anchor">
          <button
            type="button"
            className="sw"
            title="Switch draft"
            aria-haspopup="menu"
            aria-expanded={overlay?.kind === 'draft'}
            onClick={() => toggle('draft')}
          >
            Main ▾
          </button>
          {overlay?.kind === 'draft' && (
            <Menu
              label="Drafts"
              style={{ left: 0 }}
              onClose={close}
              items={[{ label: 'Main', current: true, onSelect: () => {} }]}
            />
          )}
        </span>
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
        <button
          type="button"
          className={`ib${overlay?.kind === 'share' ? ' on' : ''}`}
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
                label: 'Copy invite link',
                onSelect: () => toast.show('Invite links arrive with accounts in a later phase'),
              },
              {
                label: 'Invite co-writer…',
                onSelect: () => toast.show('Inviting co-writers comes with roles in a later phase'),
              },
            ]}
          />
        )}
      </div>
    </header>
  );
}
