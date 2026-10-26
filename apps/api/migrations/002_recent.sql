-- RECENT in the home sidebar, kept on the server so it follows a writer between devices (D-042).
-- Times only, never content.
create table episode_opens (
  user_id uuid not null references users (id) on delete cascade,
  episode_id uuid not null references episodes (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);
create index episode_opens_recent on episode_opens (user_id, opened_at desc);
