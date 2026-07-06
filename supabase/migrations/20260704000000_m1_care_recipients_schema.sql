-- M1 of the care-recipients design (docs/architecture.md): purely
-- additive schema. No existing table changes
-- semantics; the application keeps running on the legacy tables until M3.
-- Seeding (flagship recipient, memberships, metric definitions) is done by
-- scripts/seed-m1.ts, not here — no personal data in migrations.

-- 1. Enums

create type log_cadence as enum ('one_per_day', 'multiple_per_day');

create type care_role as enum ('owner', 'caregiver', 'clinician', 'recipient');

create type metric_value_type as enum (
  'scale',                -- config: {min, max}          → avg
  'boolean',              -- (tasks)                     → completion %
  'number',               -- config: {unit, min?, max?}  → avg or sum
  'duration_minutes',     -- config: {options?}          → sum
  'time_range',           -- {start,end} → hours         → avg
  'enum',                 -- config: {options[]}         → distribution
  'medication_checklist'  -- built-in: items from medication_stocks → adherence %
);

create type metric_cadence as enum ('daily', 'weekly');

-- 2. Tables

create table care_recipients (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  kind          text not null default 'human',
  timezone      text not null default 'UTC',
  log_cadence   log_cadence not null default 'one_per_day',
  -- optional geofence; OFF by default (decision #3) — all three set or none
  geo_lat       double precision check (geo_lat between -90 and 90),
  geo_lng       double precision check (geo_lng between -180 and 180),
  geo_radius_m  integer check (geo_radius_m > 0),
  active        boolean not null default true,
  created_at    timestamptz not null default timezone('utc'::text, now()),
  constraint care_recipients_geofence_all_or_none check (
    (geo_lat is null) = (geo_lng is null)
    and (geo_lat is null) = (geo_radius_m is null)
  )
);

create table care_team_members (
  recipient_id    uuid not null references care_recipients on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  role            care_role not null,
  member_label    text,
  receives_alerts boolean not null default false,
  created_at      timestamptz not null default timezone('utc'::text, now()),
  primary key (recipient_id, user_id)
);

create table metric_definitions (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references care_recipients on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label         text not null,
  value_type    metric_value_type not null,
  config        jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  cadence       metric_cadence not null default 'daily',
  -- weekday for weekly metrics, Mon=0 (same convention as schedule_config)
  cadence_day   smallint check (cadence_day between 0 and 6),
  filled_by     care_role not null default 'caregiver',
  required      boolean not null default false,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  unique (recipient_id, key),
  constraint metric_definitions_weekly_has_day check (
    cadence <> 'weekly' or cadence_day is not null
  )
);

create table care_log_entries (
  id                 uuid primary key default gen_random_uuid(),
  recipient_id       uuid not null references care_recipients on delete cascade,
  author_id          uuid not null references auth.users on delete cascade,
  log_date           date not null, -- frequency governed by log_cadence (API-enforced)
  values             jsonb not null check (jsonb_typeof(values) = 'object'),
  notes              text check (char_length(notes) <= 1000),
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),
  location_verified  boolean not null default false,
  created_at         timestamptz not null default timezone('utc'::text, now())
);

create index care_log_entries_recipient_date_idx
  on care_log_entries (recipient_id, log_date);

create table alert_configs (
  recipient_id     uuid primary key references care_recipients on delete cascade,
  -- local hour (recipient timezone) after which a missing log alerts; null = off
  missing_log_hour smallint check (missing_log_hour between 0 and 23),
  -- alert when remaining medication covers fewer than this many days; null = off
  low_stock_days   smallint check (low_stock_days > 0)
);

-- 3. Link legacy per-recipient data (nullable until backfilled by the seed)

alter table medication_stocks
  add column recipient_id uuid references care_recipients on delete cascade;

alter table invoices
  add column recipient_id uuid references care_recipients on delete cascade;

-- 4. RLS: enabled with NO policies — deny all client access. Until M3 the
-- application does not touch these tables; access is service-role only.
-- Membership-based policies arrive in M3 together with the route switch.

alter table care_recipients enable row level security;
alter table care_team_members enable row level security;
alter table metric_definitions enable row level security;
alter table care_log_entries enable row level security;
alter table alert_configs enable row level security;

-- 5. Table-level grants: service_role only (backend admin path). Tables in
-- this project need explicit grants (see 20260702000000). authenticated gets
-- nothing until M3 ships the membership-based policies.

grant all on table care_recipients to service_role;
grant all on table care_team_members to service_role;
grant all on table metric_definitions to service_role;
grant all on table care_log_entries to service_role;
grant all on table alert_configs to service_role;
