-- Contract phase (A24 expand/contract) of the notes -> shift_notes rename.
-- The expand migration (20260808000000) added shift_notes, backfilled it, and
-- installed a forward-fill trigger while the app dual-wrote both columns. The
-- released version now writes and reads only shift_notes, so the legacy column
-- and its sync scaffolding are removed.
--
-- ORDERING: apply ONLY after a released build that no longer references `notes`
-- is live in production (verified). Dropping it while dual-write code still runs
-- would break every care-log write.

drop trigger if exists care_log_entries_sync_shift_notes on care_log_entries;
drop function if exists care_log_entries_sync_shift_notes();

-- care_log_entries_notes_check drops automatically with the column.
alter table care_log_entries
  drop column if exists notes;
