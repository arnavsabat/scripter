// The fake API's series, episodes, members and invitations (for the browser tests, D-048): the
// same shapes, messages and role rules as apps/api, held in memory. The real rules are tested
// against Postgres in apps/api/test; these exist so Home's browser tests have something to click.
import { randomUUID } from 'node:crypto';

export interface FakeUser {
  id: string;
  name: string;
  email: string;
}
type Role = 'showrunner' | 'writer' | 'viewer';
interface Episode {
  id: string;
  name: string;
  position: number;
  writers: string[];
  live: string[];
  editedAt: string;
  deletedAt: string | null;
  draftId: string;
}
interface Invite {
  id: string;
  email: string;
  role: 'writer' | 'viewer';
  from: string;
  at: string;
  state: 'pending' | 'accepted' | 'cancelled';
}
interface Series {
  id: string;
  name: string;
  isSeries: boolean;
  members: Map<string, Role>;
  episodes: Episode[];
  invites: Invite[];
  deletedAt: string | null;
}
type Reply = { status: number; body: unknown } | null;

const now = () => new Date().toISOString();
const err = (status: number, error: string, message: string) => ({
  status,
  body: { error, message },
});
const forbidden = () => err(403, 'forbidden', 'Only the showrunner can do that.');

export function fakeRooms(users: Map<string, FakeUser>) {
  const all: Series[] = [];
  const opened = new Map<string, string[]>(); // user id -> episode ids, newest first

  const user = (name: string) => {
    const email = `${name.toLowerCase()}@example.com`;
    if (!users.has(email)) users.set(email, { id: randomUUID(), name, email });
    return users.get(email)!;
  };
  const byId = (id: string) => [...users.values()].find((u) => u.id === id);
  const liveEps = (s: Series) =>
    s.episodes.filter((e) => !e.deletedAt).sort((a, b) => a.position - b.position);
  const number = (s: Series, e: Episode) =>
    s.episodes.filter((x) => !x.deletedAt && x.position < e.position).length + 1;
  const canEdit = (s: Series, e: Episode, uid: string) =>
    s.members.get(uid) === 'showrunner' ||
    (s.members.get(uid) === 'writer' && e.writers.includes(uid));

  function addEpisode(s: Series, name: string, by: string, writers = [by]) {
    const id = randomUUID();
    const position = Math.max(0, ...s.episodes.map((e) => e.position)) + 1;
    s.episodes.push({
      id,
      name,
      position,
      writers,
      live: [],
      editedAt: now(),
      deletedAt: null,
      draftId: `ep-${id.slice(0, 8)}`,
    });
    return id;
  }
  function addSeries(name: string, isSeries: boolean, showrunner: string) {
    const s: Series = {
      id: randomUUID(),
      name,
      isSeries,
      members: new Map([[showrunner, 'showrunner']]),
      episodes: [],
      invites: [],
      deletedAt: null,
    };
    all.unshift(s);
    return s;
  }

  /** The prototype's sample room, from `me`'s point of view (prototype v2). */
  function seed(me: FakeUser) {
    const [maya, sam, priya] = [user('Maya'), user('Sam'), user('Priya')];
    const harbor = addSeries('Harbor Lights', true, sam.id);
    harbor.members.set(me.id, 'writer').set(maya.id, 'writer');
    addEpisode(harbor, 'Pilot', me.id);
    addEpisode(harbor, 'Low Tide', maya.id);
    const night = addSeries('Night Shift', false, me.id);
    addEpisode(night, 'Night Shift', me.id);
    const ln = addSeries('The Long Night', true, me.id);
    ln.members.set(maya.id, 'writer').set(sam.id, 'writer').set(priya.id, 'viewer');
    addEpisode(ln, 'Pilot', maya.id, [maya.id]);
    addEpisode(ln, 'Undertow', sam.id, [sam.id]);
    addEpisode(ln, 'The Long Night', maya.id, [maya.id, sam.id]);
    ln.episodes[2]!.live = [maya.id, sam.id];
    // Fogline, run by Sam, has invited `me`.
    const fog = addSeries('Fogline', true, sam.id);
    addEpisode(fog, 'Pilot', sam.id);
    fog.invites.push({
      id: randomUUID(),
      email: me.email,
      role: 'writer',
      from: sam.id,
      at: now(),
      state: 'pending',
    });
  }

  const find = (id: string) => all.find((s) => s.id === id && !s.deletedAt);
  const findEpisode = (id: string) => {
    for (const s of all) {
      const e = s.episodes.find((x) => x.id === id);
      if (e) return { s, e };
    }
    return null;
  };
  const people = (ids: string[]) =>
    ids
      .map(byId)
      .filter((u) => !!u)
      .map((u) => ({ id: u.id, name: u.name }));

  function home(me: FakeUser) {
    const mine = all.filter((s) => !s.deletedAt && s.members.has(me.id));
    const month = 30 * 86_400_000;
    const recent = (opened.get(me.id) ?? [])
      .filter((id) => {
        const f = findEpisode(id);
        return f && !f.e.deletedAt && !f.s.deletedAt && f.s.members.has(me.id);
      })
      .slice(0, 3);
    return {
      series: mine.map((s) => {
        const role = s.members.get(me.id)!;
        return {
          id: s.id,
          name: s.name,
          isSeries: s.isSeries,
          role,
          canEdit: role === 'showrunner',
          episodes: liveEps(s).map((e) => ({
            id: e.id,
            name: e.name,
            number: number(s, e),
            editedAt: e.editedAt,
            writers: people(e.writers),
            live: people(e.live),
            canEdit: canEdit(s, e, me.id),
          })),
        };
      }),
      recent,
      invitations: all.flatMap((s) =>
        s.deletedAt || s.members.has(me.id)
          ? []
          : s.invites
              .filter((i) => i.state === 'pending' && i.email === me.email)
              .map((i) => ({
                id: i.id,
                seriesId: s.id,
                seriesName: s.name,
                from: byId(i.from)?.name ?? 'Someone',
                role: i.role,
              })),
      ),
      trash: [
        ...all
          .filter(
            (s) =>
              s.deletedAt &&
              s.members.get(me.id) === 'showrunner' &&
              Date.now() - Date.parse(s.deletedAt) < month,
          )
          .map((s) => ({
            kind: s.isSeries ? 'series' : 'script',
            id: s.id,
            name: s.name,
            episodes: liveEps(s).length,
            deletedAt: s.deletedAt,
          })),
        ...all
          .filter((s) => !s.deletedAt && s.members.get(me.id) === 'showrunner')
          .flatMap((s) =>
            s.episodes
              .filter((e) => e.deletedAt)
              .map((e) => ({
                kind: 'episode',
                id: e.id,
                name: e.name,
                number: number(s, e),
                seriesId: s.id,
                seriesName: s.name,
                deletedAt: e.deletedAt,
              })),
          ),
      ],
    };
  }

  function join(s: Series, uid: string, role: Role) {
    const rank = { viewer: 1, writer: 2, showrunner: 3 };
    const current = s.members.get(uid);
    s.members.set(uid, current && rank[current] >= rank[role] ? current : role);
  }

  async function handle(
    m: string,
    path: string,
    body: () => Promise<Record<string, string>>,
    me: FakeUser,
  ): Promise<Reply> {
    if (m === 'GET' && path === '/api/home') return { status: 200, body: home(me) };
    if (m === 'POST' && path === '/api/series') {
      const b = await body();
      const isSeries = b.kind === 'series';
      const s = addSeries(
        b.name ?? (isSeries ? 'Untitled series' : 'Untitled script'),
        isSeries,
        me.id,
      );
      const episodeId = isSeries ? null : addEpisode(s, s.name, me.id);
      return { status: 200, body: { seriesId: s.id, episodeId } };
    }
    if (m === 'POST' && path === '/api/invitations/accept') {
      const { token } = await body();
      if (!token?.startsWith('fogline'))
        return err(
          410,
          'invitation_used',
          'This invitation has expired or was already used. Ask the showrunner for a new one.',
        );
      let fog = all.find((s) => s.name === 'Fogline' && !s.deletedAt);
      if (!fog) {
        fog = addSeries('Fogline', true, user('Sam').id);
        addEpisode(fog, 'Pilot', user('Sam').id);
      }
      join(fog, me.id, 'writer');
      return { status: 200, body: { seriesId: fog.id, seriesName: fog.name, role: 'writer' } };
    }

    let r = /^\/api\/series\/([0-9a-f-]{36})(\/.*)?$/.exec(path);
    if (r) {
      const [, id, rest = ''] = r;
      if (m === 'POST' && rest === '/restore') {
        const s = all.find((x) => x.id === id && x.deletedAt);
        if (!s || s.members.get(me.id) !== 'showrunner')
          return err(404, 'not_found', 'That deleted series doesn’t exist.');
        s.deletedAt = null;
        return { status: 200, body: { ok: true } };
      }
      const s = find(id!);
      if (!s || !s.members.has(me.id)) return err(404, 'not_found', 'That series doesn’t exist.');
      const sr = s.members.get(me.id) === 'showrunner';
      if (rest === '/members' && m === 'GET')
        return {
          status: 200,
          body: {
            members: [...s.members].map(([uid, role]) => ({
              id: uid,
              name: byId(uid)?.name ?? '?',
              role,
              episodes: liveEps(s)
                .filter((e) => e.writers.includes(uid))
                .map((e) => e.id),
            })),
            invited: s.invites
              .filter((i) => i.state === 'pending')
              .map((i) => ({ id: i.id, email: i.email, role: i.role, invitedAt: i.at })),
          },
        };
      if (!sr) return forbidden();
      if (m === 'PATCH' && rest === '') {
        const { name } = await body();
        s.name = name!;
        if (!s.isSeries && s.episodes[0]) s.episodes[0].name = name!;
        return { status: 200, body: { ok: true } };
      }
      if (m === 'DELETE' && rest === '') {
        s.deletedAt = now();
        return { status: 200, body: { ok: true } };
      }
      if (m === 'POST' && rest === '/episodes') {
        s.isSeries = true;
        return {
          status: 200,
          body: { episodeId: addEpisode(s, (await body()).name ?? 'Untitled', me.id) },
        };
      }
      if (m === 'POST' && rest === '/invitations') {
        const b = await body();
        const email = b.email!.toLowerCase();
        if ([...s.members.keys()].some((uid) => byId(uid)?.email === email))
          return err(409, 'already_member', `${b.email} is already in ${s.name}.`);
        for (const i of s.invites)
          if (i.email === email && i.state === 'pending') i.state = 'cancelled';
        s.invites.push({
          id: randomUUID(),
          email,
          role: b.role as 'writer' | 'viewer',
          from: me.id,
          at: now(),
          state: 'pending',
        });
        return { status: 200, body: { ok: true } };
      }
      const member = /^\/members\/([0-9a-f-]{36})$/.exec(rest);
      if (member) {
        const uid = member[1]!;
        const lastShowrunner =
          s.members.get(uid) === 'showrunner' &&
          [...s.members.values()].filter((x) => x === 'showrunner').length === 1;
        const b = m === 'PATCH' ? await body() : {};
        if (lastShowrunner && (m === 'DELETE' || b.role !== 'showrunner'))
          return err(409, 'last_showrunner', 'Make someone else showrunner first.');
        if (m === 'DELETE') s.members.delete(uid);
        else s.members.set(uid, b.role as Role);
        if (m === 'DELETE' || b.role === 'viewer')
          for (const e of s.episodes) e.writers = e.writers.filter((w) => w !== uid);
        return { status: 200, body: { ok: true } };
      }
    }

    r = /^\/api\/invitations\/([0-9a-f-]{36})(\/accept)?$/.exec(path);
    if (r) {
      const [, id, accept] = r;
      const s = all.find((x) => x.invites.some((i) => i.id === id));
      const inv = s?.invites.find((i) => i.id === id);
      if (!s || !inv || inv.state !== 'pending')
        return err(404, 'not_found', 'That invitation doesn’t exist.');
      if (accept) {
        if (inv.email !== me.email) return err(404, 'not_found', 'That invitation doesn’t exist.');
        inv.state = 'accepted';
        join(s, me.id, inv.role);
        return { status: 200, body: { seriesId: s.id, seriesName: s.name, role: inv.role } };
      }
      if (s.members.get(me.id) !== 'showrunner') return forbidden();
      if (m === 'DELETE') inv.state = 'cancelled';
      else inv.role = (await body()).role as 'writer' | 'viewer';
      return { status: 200, body: { ok: true } };
    }

    r = /^\/api\/episodes\/([0-9a-f-]{36})(\/restore)?$/.exec(path);
    if (r) {
      const found = findEpisode(r[1]!);
      if (!found || found.s.deletedAt) return err(404, 'not_found', 'That episode doesn’t exist.');
      const { s, e } = found;
      const role = s.members.get(me.id);
      if (r[2]) {
        if (role !== 'showrunner') return forbidden();
        e.deletedAt = null;
        return { status: 200, body: { ok: true } };
      }
      if (e.deletedAt) return err(404, 'not_found', 'That episode doesn’t exist.');
      if (!role)
        return err(403, 'no_access', 'You don’t have access to this episode. Ask the showrunner.');
      if (m === 'GET') {
        opened.set(me.id, [e.id, ...(opened.get(me.id) ?? []).filter((x) => x !== e.id)]);
        return {
          status: 200,
          body: {
            id: e.id,
            name: e.name,
            number: number(s, e),
            series: { id: s.id, name: s.name, isSeries: s.isSeries },
            role,
            canEdit: canEdit(s, e, me.id),
            draftId: e.draftId,
          },
        };
      }
      if (m === 'PATCH') {
        if (!canEdit(s, e, me.id)) return err(403, 'forbidden', 'You can’t edit this episode.');
        e.name = (await body()).name!;
        if (!s.isSeries) s.name = e.name;
        return { status: 200, body: { ok: true } };
      }
      if (m === 'DELETE') {
        if (role !== 'showrunner') return forbidden();
        if (s.isSeries) e.deletedAt = now();
        else s.deletedAt = now();
        return { status: 200, body: { ok: true, deleted: s.isSeries ? 'episode' : 'script' } };
      }
    }
    return null;
  }

  /** Test shortcut: take someone off an episode, as its series' showrunner would. */
  function unassign(episodeName: string, name: string) {
    const uid = user(name).id;
    for (const s of all)
      for (const e of s.episodes)
        if (e.name === episodeName) e.writers = e.writers.filter((w) => w !== uid);
  }

  return { handle, seed, user, unassign, reset: () => ((all.length = 0), opened.clear()) };
}
