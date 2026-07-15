-- Custom metric recurrence (M4 follow-up): Google-Calendar-style cadences.
-- The frequency picker offers Daily and Custom; Custom = weekly, monthly or
-- quarterly anchored to a start date (cadence_start). Weekly derives its
-- weekday from the start date; monthly repeats on the start date's
-- day-of-month (clamped in shorter months); quarterly every third month.
-- Legacy weekly rows (cadence_day set, no start date) keep working.

alter type metric_cadence add value if not exists 'monthly';
alter type metric_cadence add value if not exists 'quarterly';

alter table metric_definitions
  add column if not exists cadence_start date;

-- monthly/quarterly are meaningless without an anchor date. Compared as text
-- because the enum values added above are unusable inside this transaction.
alter table metric_definitions
  add constraint metric_definitions_cadence_start_check
  check (cadence::text not in ('monthly', 'quarterly') or cadence_start is not null);
