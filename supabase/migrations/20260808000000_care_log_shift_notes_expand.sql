-- Expand phase (A24 expand/contract) of renaming care_log_entries.notes ->
-- shift_notes. The column holds the therapeutic-companion (Acompanhante
-- Terapêutico) shift log left on daily care-log entries; "shift_notes" names
-- that usage. Clinician session write-ups moved to values.session_feedback_text
-- long ago, so by now this column is caregiver shift notes only.
--
-- ADDITIVE ONLY. `notes` is retained and kept in sync through the transition;
-- a later CONTRACT migration drops `notes`, the sync trigger, and the app's
-- dual-write once a released version no longer references `notes`.

alter table care_log_entries
  add column shift_notes text;

-- Mirror the length guard the legacy notes column carries (CARE_LOG_NOTES_MAX).
alter table care_log_entries
  add constraint care_log_entries_shift_notes_check
  check (char_length(shift_notes) <= 2000);

-- Backfill existing rows from the legacy column.
update care_log_entries
  set shift_notes = notes
  where notes is not null
    and shift_notes is null;

-- Transition sync: an INSERT/UPDATE that sets `notes` but not `shift_notes`
-- (old code still serving during the migrate->deploy window) forward-fills
-- shift_notes. Forward-only — it never writes `notes`, so a deliberate clear
-- (both null) is never resurrected. Dropped in the contract migration.
create or replace function care_log_entries_sync_shift_notes()
returns trigger
language plpgsql
as $$
begin
  if new.shift_notes is null and new.notes is not null then
    new.shift_notes := new.notes;
  end if;
  return new;
end;
$$;

drop trigger if exists care_log_entries_sync_shift_notes on care_log_entries;
create trigger care_log_entries_sync_shift_notes
  before insert or update on care_log_entries
  for each row execute function care_log_entries_sync_shift_notes();
