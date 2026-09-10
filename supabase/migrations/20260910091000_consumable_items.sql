-- Consumable/medical-supply counting (admin console). Tracks non-medication
-- consumables (e.g. incontinence pads, syringes, dressing supplies) per care
-- circle so the admin console can surface a low-stock flag the same way
-- medication_stocks already does, without conflating the two domains — a
-- consumable has no dosage schedule, just a usage rate.

create table consumable_items (
  id                       uuid primary key default gen_random_uuid(),
  recipient_id             uuid not null references care_recipients (id) on delete cascade,
  name                     text not null check (char_length(name) between 1 and 200),
  unit                     text not null check (char_length(unit) between 1 and 40),
  current_quantity         numeric not null check (current_quantity >= 0),
  -- Guards every days-of-supply division downstream: a zero usage rate can
  -- never reach the app layer, so daysOfSupplyRemaining never divides by zero.
  daily_usage_rate         numeric not null check (daily_usage_rate > 0),
  low_stock_threshold_days numeric not null default 3 check (low_stock_threshold_days > 0),
  active                   boolean not null default true,
  created_at               timestamptz not null default timezone('utc'::text, now()),
  updated_at               timestamptz not null default timezone('utc'::text, now())
);

create index consumable_items_recipient_idx on consumable_items (recipient_id);

alter table consumable_items enable row level security;

-- Service-role only (mirrors alert_configs/metric_definitions): no client
-- SELECT/INSERT policies. Reads and writes go through the admin API.
grant all on table consumable_items to service_role;
