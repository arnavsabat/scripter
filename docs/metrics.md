# Writers' Room: Metrics

Two kinds of numbers live here:

1. **Beta metrics:** how writers use the product, counted from `usage_events` (SPEC 5.9, D-082). Counts only, never script content.
2. **Engineering numbers:** how fast and how safe the system is, from the performance tests and the load-test harness. They're filled in as each one is measured, with the date, machine and commit.

---

## 1. Beta metrics

### What is recorded

Each row in `usage_events` is an event name, a user, an episode and a time. Nothing else: no text, no titles, no scene names.

| Event | Recorded by | When |
|---|---|---|
| `session_started` | the sync server (home server) | someone opens a script (main or a what-if). Counted at most once per 30 minutes per person per episode, so a reconnect or a second tab isn't a new session. Viewers count. |
| `multi_writer_session` | the sync server | two or more people who can **edit** are connected to the same draft at once. One row per writer present, at most once per 30 minutes per person per episode. Someone working in a what-if is also connected to main (to compare and send), so a what-if writer and a main writer count as working together. |
| `whatif_created` | the API | + New what-if succeeds. |
| `scene_sent` | the browser | Send to main succeeds; one row per scene sent (a Review all send of 3 scenes is 3 rows). An Undo doesn't remove them. |
| `script_imported` | the browser | an .fdx or Fountain file becomes a new script. |
| `pdf_exported` | the browser | Share › Export PDF finishes. |

Browser events can be lost (a closed tab, a blocked request); the server events can't. Rows outlive deleted episodes (the episode ID becomes null) and deleted accounts (the user becomes null).

### How to run the queries

Locally: `docker compose exec postgres psql -U wr writers_room`. On AWS: see `docs/runbook.md` ("Reading the beta metrics").

Your own testing would skew a small beta, so every query below leaves out the accounts listed in `:excluded`. Set it first, in psql (your addresses never go in this public file):

```sql
\set excluded '''you@example.com'', ''your-other@example.com'''
```

Every query starts from this view of the events, which drops those accounts:

```sql
create or replace temp view ev as
  select e.event, e.user_id, e.episode_id, e.occurred_at,
         date_trunc('week', e.occurred_at)::date as week
    from usage_events e
    left join users u on u.id = e.user_id
   where u.email is null or u.email not in (:excluded);
```

### The weekly table

One row per week (weeks start on Monday, UTC): active writers, sessions, active scripts, rooms, and the feature counts.

```sql
select week,
       count(distinct user_id)    filter (where event = 'session_started')      as active_people,
       count(*)                   filter (where event = 'session_started')      as sessions,
       count(distinct episode_id) filter (where event = 'session_started')      as active_scripts,
       count(distinct episode_id) filter (where event = 'multi_writer_session') as scripts_with_2plus_writers,
       count(distinct user_id)    filter (where event = 'multi_writer_session') as people_cowriting,
       count(*)                   filter (where event = 'whatif_created')       as whatifs_created,
       count(*)                   filter (where event = 'scene_sent')           as scenes_sent,
       count(*)                   filter (where event = 'script_imported')      as scripts_imported,
       count(*)                   filter (where event = 'pdf_exported')         as pdfs_exported
  from ev
 group by week
 order by week;
```

### Weekly return rate

Of the people who had a session in a week, the share who had another the following week. SPEC 5.9 derives this from the events; it's the beta's main health number.

```sql
with active as (
  select distinct week, user_id from ev where event = 'session_started'
)
select a.week,
       count(*)                                          as active_people,
       count(b.user_id)                                  as came_back_next_week,
       round(100.0 * count(b.user_id) / count(*), 1)     as return_rate_pct
  from active a
  left join active b on b.user_id = a.user_id and b.week = a.week + 7
 where a.week + 7 <= date_trunc('week', now())::date   -- only weeks whose next week is over
 group by a.week
 order by a.week;
```

### Who uses the writers'-room features

The share of active people each week who co-wrote live, made a what-if, or sent a scene: whether the features that make this a writers' room tool get used at all.

```sql
with by_person as (
  select week, user_id,
         bool_or(event = 'multi_writer_session') as cowrote,
         bool_or(event = 'whatif_created')       as made_whatif,
         bool_or(event = 'scene_sent')           as sent_scene
    from ev
   group by week, user_id
)
select week,
       count(*)                                                  as active_people,
       round(100.0 * count(*) filter (where cowrote)     / count(*), 1) as cowrote_pct,
       round(100.0 * count(*) filter (where made_whatif) / count(*), 1) as made_whatif_pct,
       round(100.0 * count(*) filter (where sent_scene)  / count(*), 1) as sent_scene_pct
  from by_person
 group by week
 order by week;
```

### First week to second week (new people)

People grouped by the week of their first session, and how many came back in each of the next three weeks.

```sql
with active as (
  select distinct week, user_id from ev where event = 'session_started'
), first as (
  select user_id, min(week) as cohort from active group by user_id
)
select f.cohort,
       count(distinct f.user_id)                                       as new_people,
       count(distinct a.user_id) filter (where a.week = f.cohort + 7)  as week_2,
       count(distinct a.user_id) filter (where a.week = f.cohort + 14) as week_3,
       count(distinct a.user_id) filter (where a.week = f.cohort + 21) as week_4
  from first f
  left join active a on a.user_id = f.user_id
 group by f.cohort
 order by f.cohort;
```

### Rooms

How big the rooms are: for each script with a session in the last 28 days, how many different people opened it and how many co-wrote live.

```sql
select episode_id,
       count(distinct user_id) filter (where event = 'session_started')      as people,
       count(distinct user_id) filter (where event = 'multi_writer_session') as cowriters,
       count(*)                filter (where event = 'scene_sent')           as scenes_sent
  from ev
 where occurred_at > now() - interval '28 days' and episode_id is not null
 group by episode_id
 order by people desc, cowriters desc;
```

---

## 2. Engineering numbers

Filled in as each is measured. Each number names the date, the machine and the commit, so it can be quoted honestly.

### Editor and pagination

Measured 2026-10-27 on an Apple M2 MacBook (8 GB), Chromium through Playwright 1.64 (Vitest browser mode), at commit `064771c` plus the D-087 test. The script is 110 pages (about 2,600 lines). "Work" is the editor's own time per update (the ProseMirror state update, including re-pagination and redrawing page breaks); "slowest key" is the browser's Event Timing measure, keydown to the next paint, which is what a writer feels (it reports in 8 ms steps from 16 ms). A frame drop is a frame longer than 33 ms (two frames at 60 Hz). Guarded by `apps/web/test/perf.test.tsx`.

| Scenario | Work p50 | Work p95 | Slowest key | Frames over 33 ms | Long tasks |
|---|---|---|---|---|---|
| Typing alone, open view, near the top | 1.0 ms | 1.9 ms | 16 ms | – | – |
| Typing alone, page view, near the top | 1.0 ms | 1.3 ms | 24 ms | – | – |
| Reading while 2 co-writers type, open view (42 remote updates in 4 s) | 2.4 ms | 3.5 ms | – | 0 of 240 | 0 |
| Reading while 2 co-writers type, page view | 1.4 ms | 2.1 ms | – | 0 of 240 | 0 |
| Typing with 2 co-writers typing, open view, near the top | 1.3 ms | 1.7 ms | 16 ms | 0 | 0 |
| Typing with 2 co-writers typing, page view, near the end | 1.5 ms | 1.8 ms | 16 ms | 0 | 0 |
| In a what-if while 2 co-writers type in main (live three-way comparison), reading | – | – | – | 0 of 240 | 0 |
| In a what-if while 2 co-writers type in main, typing | – | 1.0 ms | 24 ms | 0 | 0 |

Pieces on their own (Node 24, same machine):

- **Pagination:** a 118-page script paginates in about 2 ms; an edit near the end re-paginates in about 0.04 ms (D-078).
- **The three-way scene comparison** (`compareScenes`) over 110 pages: 4.2 ms p50, 4.7 ms p95. It reruns at most once a frame however many co-writers type, so a what-if never spends more than about a third of a frame on it.

What this means: with three writers in one 110-page episode, no update costs more than about 4 ms of a 16.7 ms frame, in either view, so nothing drops frames. The headroom is about 4x for a single key, and the binding's per-key cost grows with document length (Known risks, D-012).

### Sync service under load

*To be filled by the load tests (beta-readiness phase, step 6): the rooms + capacity targets in D-082.*
