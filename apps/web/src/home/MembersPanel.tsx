// The Members panel (D-030, D-027, D-051): everyone in the series with their role and episodes.
// The showrunner changes roles, removes people (after an inline confirm), cancels invitations and
// invites by email; everyone else sees the same list, read-only.
import { colorFor } from '@wr/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiFailure, api } from '../api';
import type { Me } from '../auth';
import { Icon } from '../components/Icons';
import { RowsSkeleton } from '../components/Skeleton';
import { Menu, type MenuItem } from '../components/Menu';
import { useToast } from '../components/Toast';
import { initials } from '../session';
import type { HomeSeries } from './useHome';

interface Member {
  id: string;
  name: string;
  role: 'showrunner' | 'writer' | 'viewer';
  episodes: string[];
}
interface Invited {
  id: string;
  email: string;
  role: 'writer' | 'viewer';
  invitedAt: string;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const ORDER = { showrunner: 0, writer: 1, viewer: 2 };

export function MembersPanel({
  s,
  me,
  onClose,
  onChanged,
}: {
  s: HomeSeries;
  me: Me;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const sr = s.role === 'showrunner';
  const [list, setList] = useState<{ members: Member[]; invited: Invited[] } | null>(null);
  const [menu, setMenu] = useState<string | null>(null); // member or invitation id
  const [removing, setRemoving] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'writer' | 'viewer'>('writer');
  const [picking, setPicking] = useState(false);

  const [asked, setAsked] = useState(0);
  const load = useCallback(() => setAsked((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<{ members: Member[]; invited: Invited[] }>('GET', `/api/series/${s.id}/members`).then(
      (l) => {
        if (live) setList(l);
      },
      () => {}, // keep what we had
    );
    return () => {
      live = false;
    };
  }, [s.id, asked]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast.show(done);
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'Something went wrong.');
    }
    load();
    onChanged();
  };

  const epsOf = (m: Member) => {
    if (m.role === 'showrunner') return 'All episodes';
    if (m.role === 'viewer') return 'Reads everything';
    const names = s.episodes
      .filter((e) => m.episodes.includes(e.id))
      .map((e) => (s.isSeries ? `Ep ${e.number}` : e.name));
    return names.join(', ') || 'No episodes yet';
  };

  const invite = () => {
    const address = email.trim();
    if (!address.includes('@')) return;
    void act(async () => {
      await api('POST', `/api/series/${s.id}/invitations`, { email: address, role });
      setEmail('');
    }, `Invitation sent to ${address}`);
  };

  const members = [...(list?.members ?? [])].sort(
    (a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0) || ORDER[a.role] - ORDER[b.role],
  );
  const invited = list?.invited ?? [];
  const n = members.length;

  const roleMenu = (m: Member): MenuItem[] => [
    ...(['showrunner', 'writer', 'viewer'] as const).map((r) => ({
      label: cap(r),
      current: m.role === r,
      onSelect: () =>
        void act(
          () => api('PATCH', `/api/series/${s.id}/members/${m.id}`, { role: r }),
          r === m.role ? undefined : `${m.name.split(/\s+/)[0]} is now a ${r}`,
        ),
    })),
    { label: 'Remove from series', separated: true, onSelect: () => setRemoving(m.id) },
  ];
  const inviteMenu = (i: Invited): MenuItem[] => [
    ...(['writer', 'viewer'] as const).map((r) => ({
      label: cap(r),
      current: i.role === r,
      onSelect: () => void act(() => api('PATCH', `/api/invitations/${i.id}`, { role: r })),
    })),
    {
      label: 'Cancel invitation',
      separated: true,
      onSelect: () =>
        void act(
          () => api('DELETE', `/api/invitations/${i.id}`),
          `Invitation to ${i.email} cancelled`,
        ),
    },
  ];

  return (
    <div className="rp">
      <div className="rh">
        <span>
          <b>Members</b>
          <small>
            {/* Until the list arrives: no count yet (a skeleton below, D-084). */}
            {!list ? '\u00a0' : `${n} ${n === 1 ? 'person' : 'people'}`}
            {invited.length ? ` · ${invited.length} invited` : ''}
          </small>
        </span>
        <button
          type="button"
          className="ib"
          title="Close members"
          aria-label="Close members"
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="rb ml">
        {!list && <RowsSkeleton widths={['55%', '42%', '48%']} />}
        {members.map((m) =>
          removing === m.id ? (
            <div key={m.id} className="mrow cf cfs">
              <span className="cfq">
                Remove {m.name} from {s.name}?
              </span>
              <span className="cfa">
                <button
                  type="button"
                  className="ta"
                  data-t="Cancel"
                  onClick={() => setRemoving(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ta del"
                  data-t="Remove"
                  onClick={() => {
                    setRemoving(null);
                    void act(
                      () => api('DELETE', `/api/series/${s.id}/members/${m.id}`),
                      `${m.name.split(/\s+/)[0]} removed from ${s.name}`,
                    );
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          ) : (
            <div key={m.id} className="mrow">
              <span className={`av av-${colorFor(m.id) + 1}`}>{initials(m.name)}</span>
              <span className="n">
                {m.name}
                {m.id === me.id ? ' (you)' : ''}
                <small>{epsOf(m)}</small>
              </span>
              {sr && m.id !== me.id ? (
                <span className="anchor">
                  <button
                    type="button"
                    className="role"
                    aria-haspopup="menu"
                    aria-expanded={menu === m.id}
                    onClick={() => setMenu(menu === m.id ? null : m.id)}
                  >
                    {cap(m.role)} ▾
                  </button>
                  {menu === m.id && (
                    <Menu
                      label={`${m.name}’s role`}
                      style={{ right: 0 }}
                      onClose={() => setMenu(null)}
                      items={roleMenu(m)}
                    />
                  )}
                </span>
              ) : (
                <span className="role">{cap(m.role)}</span>
              )}
            </div>
          ),
        )}
        {invited.length > 0 && <div className="lab">INVITED</div>}
        {invited.map((i) => (
          <div key={i.id} className="mrow">
            <span className="av av-2">{i.email.slice(0, 2).toUpperCase()}</span>
            <span className="n">
              {i.email}
              <small>
                Invited{' '}
                {new Date(i.invitedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · not joined yet
              </small>
            </span>
            {sr ? (
              <span className="anchor">
                <button
                  type="button"
                  className="role"
                  aria-haspopup="menu"
                  aria-expanded={menu === i.id}
                  onClick={() => setMenu(menu === i.id ? null : i.id)}
                >
                  {cap(i.role)} ▾
                </button>
                {menu === i.id && (
                  <Menu
                    label={`Invitation for ${i.email}`}
                    style={{ right: 0 }}
                    onClose={() => setMenu(null)}
                    items={inviteMenu(i)}
                  />
                )}
              </span>
            ) : (
              <span className="role">{cap(i.role)}</span>
            )}
          </div>
        ))}
      </div>
      {sr && (
        <div className="rf inv">
          <label className="fl" htmlFor="invite-email">
            Invite to {s.name}
          </label>
          <div className="irow">
            <input
              id="invite-email"
              className="fld"
              type="email"
              placeholder="Email address"
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
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
              >
                {cap(role)}
                <span className="car">▾</span>
              </button>
              {picking && (
                <Menu
                  label="Role for the invitation"
                  style={{ right: 0, top: 'auto', bottom: 34, minWidth: 140 }}
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
      )}
    </div>
  );
}
