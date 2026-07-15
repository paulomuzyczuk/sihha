-- Psychometric test results (M9): the yearly neuropsychological evaluation,
-- flattened to one row per measured score so the clinician dashboard can
-- chart development across years. The percentile is the cross-instrument,
-- cross-year comparable unit; raw_score keeps the instrument-native value
-- (PB, T score, points). Rows are ingested from the psychiatrist's PDF laudo
-- via the psychometric-ingestion skill + scripts/import-psychometrics.ts.

create table psychometric_results (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references care_recipients on delete cascade,
  test_date      date not null,
  instrument     text not null,
  measure        text not null,
  raw_score      numeric,
  percentile     numeric check (percentile between 0 and 100),
  classification text,
  source_file    text,
  created_at     timestamptz not null default timezone('utc'::text, now()),
  unique (recipient_id, test_date, instrument, measure)
);

create index psychometric_results_recipient_idx
  on psychometric_results (recipient_id, test_date);

-- Service-role only, like the other clinical tables: clients read through
-- /api/psychometrics, which authorizes via care-circle membership.
alter table psychometric_results enable row level security;
grant select, insert, update on psychometric_results to service_role;
