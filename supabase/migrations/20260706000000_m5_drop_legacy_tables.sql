-- M5: retire the legacy single-recipient tables after the M3 cutover.
-- user_profiles (clinical-profile labels) and schedule_config (weekly task
-- days) are no longer read or written by the application — memberships
-- (care_team_members.member_label) and metric_definitions (cadence_day)
-- carry this data now. care_logs stays as a frozen archive: it is the
-- source the M2 backfill parity was verified against.

drop table if exists user_profiles;
drop type if exists user_role;
drop table if exists schedule_config;
