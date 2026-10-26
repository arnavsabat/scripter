-- Accounts, series, episodes, invitations and drafts (SPEC 5.2; D-031, D-032, D-033, D-037).
-- Applied once by src/db/migrate.ts inside a transaction. Never edit an applied migration; add a new one.

-- One row per person. Signing in with Google or with an email code reaches the same person:
-- the API links each Cognito identity to the user with that verified email.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Each Cognito user (one per sign-in method) points at a person.
create table user_identities (
  cognito_sub text primary key,
  user_id uuid not null references users (id) on delete cascade,
  provider text not null check (provider in ('email', 'google', 'test')),
  created_at timestamptz not null default now()
);
create index user_identities_user on user_identities (user_id);

create table series (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  -- A plain script (one episode, one shared name) until it's created as a series or gains a
  -- second episode; after that it stays a series (D-033, D-037).
  is_series boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Soft delete: hidden at once, erased by the purge job 30 days later (D-037).
  deleted_at timestamptz
);

create table series_members (
  series_id uuid not null references series (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('showrunner', 'writer', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (series_id, user_id)
);
create index series_members_user on series_members (user_id);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  -- Sort key, never reused. "Ep N" is the episode's rank among those not deleted, so a restored
  -- episode returns to its old place without renumbering anything.
  position integer not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Updated by the home sync server at most once a minute while edits arrive (D-033).
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (series_id, position)
);

-- Assignment: who may write in an episode besides the showrunner (SPEC 5.3).
create table episode_writers (
  episode_id uuid not null references episodes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  added_by uuid references users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (episode_id, user_id)
);
create index episode_writers_user on episode_writers (user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series (id) on delete cascade,
  email text not null,
  role text not null check (role in ('writer', 'viewer')),
  -- Set when the showrunner invites from an episode's "Invite co-writer…": assigned on acceptance.
  episode_id uuid references episodes (id) on delete set null,
  -- SHA-256 of the one-time link's token. The token itself is never stored (D-032).
  token_hash bytea not null unique,
  invited_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references users (id) on delete set null,
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create index invitations_pending_email on invitations (lower(email))
  where accepted_at is null and cancelled_at is null;

-- One Y.Doc per draft: an episode's main, and each what-if (SPEC 5.2). The draft's id is the
-- document ID on the sync service.
create table drafts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes (id) on delete cascade,
  kind text not null check (kind in ('main', 'whatif')),
  name text,
  -- What-ifs fork from a snapshot of main, never from another what-if.
  base_snapshot_id uuid,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'main') = (base_snapshot_id is null))
);
create unique index drafts_one_main on drafts (episode_id) where kind = 'main';

-- Restore points writers see (Phase 3), not the sync service's compaction snapshots.
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  s3_key text not null,
  kind text not null check (kind in ('automatic', 'manual')),
  label text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table drafts add constraint drafts_base_snapshot_fk
  foreign key (base_snapshot_id) references snapshots (id);

-- Who's connected to an episode right now, written by its home sync server every 10 s and
-- treated as stale after 30 s; Home's green dot reads it (D-033).
create table episode_presence (
  episode_id uuid not null references episodes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  server_id text not null,
  seen_at timestamptz not null default now(),
  primary key (episode_id, user_id)
);

-- Counts only, never content (SPEC 5.9).
create table usage_events (
  id bigint generated always as identity primary key,
  event text not null check (event in (
    'session_started', 'multi_writer_session', 'whatif_created',
    'scene_sent', 'script_imported', 'pdf_exported'
  )),
  user_id uuid references users (id) on delete set null,
  occurred_at timestamptz not null default now()
);
