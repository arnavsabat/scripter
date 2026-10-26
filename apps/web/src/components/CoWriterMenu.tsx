// Share › Invite co-writer… (D-032, prototype v2): the series' writers, ✓ for this episode's
// co-writers; a click adds or removes one (with Undo). The showrunner can also invite someone
// new by email, who is assigned this episode when they accept.
import { colorFor } from '@wr/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiFailure, api } from '../api';
import { initials } from '../session';
import { Menu } from './Menu';
import { useToast } from './Toast';

export interface ShareContext {
  episodeId: string;
  seriesId: string;
  /** "Ep 3 · The Long Night", for toasts. */
  label: string;
  canEdit: boolean;
  showrunner: boolean;
  me: string;
}

interface Member {
  id: string;
  name: string;
  role: 'showrunner' | 'writer' | 'viewer';
  episodes: string[];
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function CoWriterMenu({ ctx, onClose }: { ctx: ShareContext; onClose: () => void }) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [asked, setAsked] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'writer' | 'viewer'>('writer');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ members: Member[] }>('GET', `/api/series/${ctx.seriesId}/members`).then(
      (r) => {
        if (live) setMembers(r.members);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [ctx.seriesId, asked]);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', outside));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', outside);
    };
  }, [onClose]);

  const writers = (members ?? []).filter((m) => m.role === 'writer');
  const assigned = (m: Member) => m.episodes.includes(ctx.episodeId);

  const set = async (m: Member, on: boolean) => {
    await api(on ? 'PUT' : 'DELETE', `/api/episodes/${ctx.episodeId}/writers/${m.id}`);
    setAsked((n) => n + 1);
  };
  const toggle = (m: Member) => {
    const on = !assigned(m);
    const first = m.name.split(/\s+/)[0];
    set(m, on).then(
      () =>
        toast.show(`${first} ${on ? 'added to' : 'removed from'} ${ctx.label}`, () => {
          set(m, !on).catch(() => toast.show('Couldn’t undo that.'));
        }),
      (err: unknown) =>
        toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t change co-writers.'),
    );
  };

  const invite = () => {
    const address = email.trim();
    if (!address.includes('@')) return;
    api('POST', `/api/series/${ctx.seriesId}/invitations`, {
      email: address,
      role,
      episodeId: ctx.episodeId,
    }).then(
      () => {
        setEmail('');
        toast.show(`Invitation sent to ${address}`);
      },
      (err: unknown) =>
        toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t send the invitation.'),
    );
  };

  return (
    <div
      ref={ref}
      className="menu below cw"
      role="menu"
      aria-label="Co-writers"
      style={{ right: 0 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="lab" style={{ padding: '8px 10px 6px' }}>
        CO-WRITERS
      </div>
      {members && !writers.length && <div className="none">No writers in this series yet.</div>}
      {writers.map((m) => (
        <button
          key={m.id}
          type="button"
          className="mi"
          role="menuitemcheckbox"
          aria-checked={assigned(m)}
          onClick={() => toggle(m)}
        >
          <span className="cwn">
            <span className={`av av-${colorFor(m.id) + 1}`}>{initials(m.name)}</span>
            {m.name}
            {m.id === ctx.me ? ' (you)' : ''}
          </span>
          <span className="ck">{assigned(m) ? '✓' : ''}</span>
        </button>
      ))}
      {ctx.showrunner && (
        <>
          <div className="sep" role="separator" />
          <div className="cwi">
            <div className="irow">
              <input
                className="fld"
                type="email"
                placeholder="Invite by email"
                aria-label="Invite by email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') invite();
                }}
              />
              <span className="pick">
                <button
                  type="button"
                  className="fbtn"
                  aria-haspopup="menu"
                  aria-label="Role for the invitation"
                  onClick={() => setPicking((p) => !p)}
                >
                  {cap(role)}
                  <span className="car">▾</span>
                </button>
                {picking && (
                  <Menu
                    label="Role for the invitation"
                    style={{ right: 0, top: 34, minWidth: 140 }}
                    onClose={() => setPicking(false)}
                    items={(['writer', 'viewer'] as const).map((r) => ({
                      label: cap(r),
                      current: role === r,
                      onSelect: () => setRole(r),
                    }))}
                  />
                )}
              </span>
              <button type="button" className="fbtn" onClick={invite}>
                Invite
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
