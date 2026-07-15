-- Overwrite audit (M6): a same-day resubmission replaces the role's entry
-- in place, so the replaced answer is snapshotted here first — the owner
-- can always see what was changed, by whom and when. Service-role only
-- (RLS on, no policies): revisions are written by the API during the
-- overwrite and read via admin tooling.

create table care_log_revisions (
  id                  uuid primary key default gen_random_uuid(),
  entry_id            uuid not null references care_log_entries on delete cascade,
  recipient_id        uuid not null references care_recipients on delete cascade,
  log_date            date not null,
  author_role         text not null,
  replaced_values     jsonb not null check (jsonb_typeof(replaced_values) = 'object'),
  replaced_notes      text,
  replaced_author_id  uuid not null,
  replaced_created_at timestamptz not null,
  overwritten_by      uuid not null,
  overwritten_at      timestamptz not null default timezone('utc'::text, now())
);

create index care_log_revisions_recipient_date_idx
  on care_log_revisions (recipient_id, log_date);

alter table care_log_revisions enable row level security;

-- The lesson from goal_programs: this project's ACL defaults grant nothing
grant select, insert on table care_log_revisions to service_role;
