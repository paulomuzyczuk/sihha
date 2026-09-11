-- Person-level shift model — supersedes the role-based
-- alert_configs.caregiver_days + schedule_exceptions (dropped in the next
-- migration). "Who is responsible for logging on date X" is now a SPECIFIC
-- person, so vacation/sickness can reassign to a named substitute rather than
-- only toggling caregiver-on/off. Both crons (the missing-log alert and the
-- fill-reminder push) resolve the responsible party from here: an override for
-- the exact date, else the weekly default for that weekday. The admin is simply
-- never assigned a shift, so they are never a primary alert target.
--
-- No seed rows here (they reference specific user ids — personal data belongs
-- in seed scripts / one-off admin ops, not migrations; see M1 convention).

-- Weekly baseline: one responsible person per recipient per weekday (Mon=0).
create table care_shift_defaults (
  recipient_id        uuid not null,
  weekday             smallint not null check (weekday between 0 and 6),
  responsible_user_id uuid not null,
  created_at          timestamptz not null default timezone('utc'::text, now()),
  primary key (recipient_id, weekday),
  -- the responsible party must actually be on this recipient's care team;
  -- removing them from the team clears their assignments.
  foreign key (recipient_id, responsible_user_id)
    references care_team_members (recipient_id, user_id) on delete cascade
);

-- Date-specific overrides: vacation, sickness, shift swaps. Wins over the
-- weekday default for that single date.
create table care_shift_overrides (
  recipient_id        uuid not null,
  shift_date          date not null,
  responsible_user_id uuid not null,
  reason              text,
  created_at          timestamptz not null default timezone('utc'::text, now()),
  primary key (recipient_id, shift_date),
  foreign key (recipient_id, responsible_user_id)
    references care_team_members (recipient_id, user_id) on delete cascade
);

-- Service-role only, same posture as alert_configs / schedule_exceptions:
-- managed by the backend (cron + admin), never read directly by clients.
alter table care_shift_defaults enable row level security;
alter table care_shift_overrides enable row level security;
grant select, insert, update, delete on table care_shift_defaults to service_role;
grant select, insert, update, delete on table care_shift_overrides to service_role;
