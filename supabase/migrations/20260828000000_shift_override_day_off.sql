-- A shift override could only REASSIGN a date, never clear it:
-- responsible_user_id was NOT NULL, so "nobody is on shift" was inexpressible.
-- That made a shift SWAP only half-recordable — the day taken on could be
-- written, the day given up could not.
--
-- Found 2026-08-28: a Fri 31/07 <-> Sat 15/08 trade agreed with the companion
-- had nowhere to live. The missing-log cron resolves the responsible party from
-- this table and skips dates with nobody assigned, so it chased him for the
-- Friday he had traded away and stayed silent on the Saturday he actually
-- worked. Every engagement figure read from the schedule was wrong in both
-- directions for those two dates.
--
-- NULL responsible_user_id now means "nobody is on shift for this date", and an
-- override row stays authoritative over the weekday default even when its user
-- is NULL (services/shiftSchedule.ts — a row's mere existence decides the day,
-- so a cleared date can no longer fall through to care_shift_defaults).
-- The composite FK is MATCH SIMPLE: a NULL user exempts the row from it while
-- a non-NULL one is still checked against care_team_members.
--
-- Expand-only (A24): widens what the column accepts, moves no data, and every
-- existing row keeps its meaning. Nothing needs to deploy in the same moment.
alter table care_shift_overrides
  alter column responsible_user_id drop not null;

comment on column care_shift_overrides.responsible_user_id is
  'Responsible person for this specific date. NULL = nobody on shift (day off, or a shift traded away). Either way the row wins over care_shift_defaults for that weekday.';
