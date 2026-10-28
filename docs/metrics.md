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

Measured with the load-test harness (`tools/loadtest`, D-092). "Latency" is one writer's keystroke reaching another writer's screen, through the durable append to the edit log that comes before any broadcast (SPEC 5.4). Every run ends by reading each script back with a fresh client: "lost" counts characters missing or wrong against what was typed, and "unacked" counts writers whose edits weren't all acknowledged. Writers type about five keys a second in bursts, with pauses, and send a presence update with every key. Raw results, with a per-second timeline, are in `tools/loadtest/results/`.

**On AWS** (D-082's quotable numbers): *to be run once the beta stacks are deployed (`docs/runbook.md`, "Load tests on AWS").* Targets: 1,000 writers in 200 scripts on 3 servers at p95 under 150 ms; one 15-writer room; a server killed mid-run with zero lost edits; and a ramp on one server to where p95 crosses 150 ms.

**Locally** (2026-10-27, Apple M2 MacBook, 8 GB; the servers as real processes on DynamoDB Local and SeaweedFS in OrbStack; commit `50e0a45` plus D-092). These prove the harness and the failure behavior; they are not capacity numbers. DynamoDB Local processes transactional writes one at a time, and on this laptop it saturates at about 100-150 appends a second, while the sync server process sits near 20% CPU (D-023's warning, now measured).

| Scenario | Writers | p50 | p95 | p99 | Max | Keystrokes | Lost | Unacked |
|---|---|---|---|---|---|---|---|---|
| One 15-writer room, 60 s, 3 servers | 15 | 9 ms | 31 ms | 77 ms | 253 ms | 2,107 | 0 | 0 |
| 8 rooms of 5, 90 s, 3 servers | 40 | 6 ms | 136 ms | 753 ms | 1,110 ms | 8,364 | 0 | 0 |
| Ramp, one server, 20 s a step (stops at the first step over 150 ms) | 10 / 20 / 40 | 10 / 8 / 8 ms | 25 / 27 / 614 ms | 42 / 46 / 801 ms | 93 / 75 / 943 ms | 3,424 | 0 | 0 |
| Failover: 6 rooms of 5, one of 3 servers SIGKILLed 25 s in | 30 | 7 ms | 564 ms | 5,383 ms | 6,645 ms | 4,102 | 0 | 0 |

Near that ceiling the numbers are noisy: an earlier ramp held p95 at 22 ms with 40 writers and broke at 60 (p95 18.5 s); this one broke at 40. Either way the limit is the emulator's single-threaded writes, which real DynamoDB doesn't have.

The failover, second by second: up to 82 ms in the seconds before the kill; keystrokes sent at the moment of the kill waited up to 6.6 s (the dead server's 6 s lease expiring, then a reconnect, D-022); back under 100 ms 7 seconds later. Nothing was lost, and every edit was acknowledged. This matches the chaos suite's 6-8 s for a crash (D-023).
