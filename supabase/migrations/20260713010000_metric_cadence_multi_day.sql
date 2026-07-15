-- Weekly metrics that repeat on several weekdays (the diarista comes Mon,
-- Tue, Thu and Fri): cadence_days holds the Mon=0..Sun=6 set, GCal-style.
-- Single-day weekly rows keep using cadence_day; cadence_days wins when set.

alter table metric_definitions
  add column if not exists cadence_days smallint[]
  check (cadence_days is null or cadence_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

-- Weekly now needs any one of: a single day, a day set, or a start date to
-- derive the day from.
alter table metric_definitions
  drop constraint metric_definitions_weekly_has_day;
alter table metric_definitions
  add constraint metric_definitions_weekly_has_day
  check (
    cadence <> 'weekly'
    or cadence_day is not null
    or cadence_days is not null
    or cadence_start is not null
  );
