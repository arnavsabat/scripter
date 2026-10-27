-- Usage counting (SPEC 5.9, D-082): counts only, never script content. Each row names the event,
-- who, which episode and when, so the beta metrics (docs/metrics.md) can count active scripts and
-- rooms as well as people. Sessions are counted at most once per 30 minutes per person per episode,
-- so the lookup below is indexed.
alter table usage_events add column episode_id uuid references episodes (id) on delete set null;
create index usage_events_recent on usage_events (event, user_id, episode_id, occurred_at desc);
create index usage_events_by_time on usage_events (occurred_at);
