-- Patient goal program (M6): a monthly award earned by meeting the goals
-- the care team logs through the daily check-in. Schema-as-data like the
-- metric definitions: each category carries its weight and the metric keys
-- it measures, e.g.
--   [{"key": "medication", "label": "Medicações", "weight": 0.3,
--     "metric_keys": ["medications"]}, ...]
-- Scoring is API-side (services/goals.ts): a category's score is the share
-- of due-and-logged metric occurrences met since the program started this
-- month; the projected award is the weighted total times the monthly amount.

create table goal_programs (
  id                  uuid primary key default gen_random_uuid(),
  recipient_id        uuid not null references care_recipients on delete cascade,
  starts_on           date not null,
  monthly_award_cents integer not null check (monthly_award_cents > 0),
  currency            text not null default 'BRL',
  categories          jsonb not null check (jsonb_typeof(categories) = 'array'),
  active              boolean not null default true,
  created_at          timestamptz not null default timezone('utc'::text, now())
);

create index goal_programs_recipient_idx
  on goal_programs (recipient_id) where active;

-- Service-role reads only (like the other care tables): RLS on, no policies.
alter table goal_programs enable row level security;
