-- What-ifs and restore points (SPEC 3.6, 3.9, 5.2; D-080).
-- A what-if is a draft forked from a snapshot of main; its Drafts-tab line shows how many scenes
-- differ, counted by whoever has it open. A restore point taken before sending remembers which
-- what-if it came from, so sends within a few minutes share one.
alter table drafts add column scenes_differ integer not null default 0;
alter table snapshots add column from_draft_id uuid references drafts (id) on delete set null;
create index snapshots_by_draft on snapshots (draft_id, created_at desc);
