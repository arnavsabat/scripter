// The one permission rule (SPEC 5.3, D-031). The API, the home sync server and the web app all ask
// these functions, so roles stay coarse in v1 (edit or view, per episode) and finer scopes
// (scene locks, cross-episode proposals) can be added here later without touching the callers.

export const ROLES = ['showrunner', 'writer', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What the caller knows about one user's place in one series, loaded from Postgres by the API or
 * the home sync server. Deleted series and episodes are never loaded, so they have no access.
 */
export interface Access {
  /** The user's role in the series, or null if they aren't a member. */
  role: Role | null;
  /** The episodes of this series the user is assigned to as a writer. */
  assigned: ReadonlySet<string>;
}

/** The series itself: its name, members, invitations and which episodes exist. */
export interface SeriesScope {
  kind: 'series';
  seriesId: string;
}

/** One episode: its script (every draft of it), its name and its co-writers. */
export interface EpisodeScope {
  kind: 'episode';
  seriesId: string;
  episodeId: string;
}

export type Scope = SeriesScope | EpisodeScope;

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** Every member can read every episode of their series (SPEC 5.3). */
export function canView(user: Access, scope: Scope): boolean {
  void scope; // same answer for every scope in v1; kept so all checks share one signature
  return user.role !== null;
}

/**
 * Series scope: only the showrunner renames the series, invites people, changes roles, removes
 * members, and creates, deletes or restores episodes.
 * Episode scope: the showrunner, or a writer assigned to the episode. That covers typing in it,
 * renaming it, and adding or removing its co-writers (D-032).
 */
export function canEdit(user: Access, scope: Scope): boolean {
  if (user.role === 'showrunner') return true;
  if (scope.kind === 'series') return false;
  return user.role === 'writer' && user.assigned.has(scope.episodeId);
}

/**
 * Sending what-if scenes to main. Writers send to main on their own episodes without approval
 * (SPEC 5.3), so in v1 this matches canEdit. It's a separate function because cross-episode
 * proposals and scene locks will make the two differ.
 */
export function canMerge(user: Access, scope: EpisodeScope): boolean {
  return canEdit(user, scope);
}

/** Only members with the writer role can be added as an episode's co-writer (D-032). */
export const canBeCoWriter = (role: Role | null): boolean => role === 'writer';

/** Who's signed in, beyond their place in a series: a guest trying the demo, or not (D-108). */
export interface Account {
  guest: boolean;
}

/**
 * Inviting someone by email, or joining a series from an invitation. Guests can't, so the demo
 * never sends email to anyone and no guest lands in someone else's room (D-108).
 */
export const canInvite = (account: Account): boolean => !account.guest;
