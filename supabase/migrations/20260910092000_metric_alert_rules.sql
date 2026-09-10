-- Per-metric alert rules (admin console): lets an admin configure "notify
-- these people when metric X crosses threshold Y" per circle, instead of the
-- app only ever alerting on the fixed low-medication-stock check. One clean
-- schema (no incremental custom-copy/recipients migrations to replay — this
-- is a fresh feature for this repo, not a port of an existing one).
create table if not exists public.metric_alert_rules (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references public.care_recipients (id) on delete cascade,
  metric_key     text not null check (char_length(metric_key) between 1 and 64),
  comparator     text not null check (comparator in ('gte', 'lte', 'eq')),
  threshold      numeric not null,
  label          text not null check (char_length(label) between 1 and 200),
  -- Null falls back to the default alert copy (emailText) at fire time.
  custom_subject text,
  custom_body    text,
  active         boolean not null default true,
  created_at     timestamptz not null default timezone('utc'::text, now())
);

create index if not exists metric_alert_rules_recipient_idx
  on public.metric_alert_rules (recipient_id);

-- Explicit per-rule recipients; a rule with none falls back to
-- getAlertRecipientEmails (the circle's receives_alerts members + admin).
create table if not exists public.metric_alert_rule_recipients (
  rule_id uuid not null references public.metric_alert_rules (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (rule_id, user_id)
);

alter table public.metric_alert_rules enable row level security;
alter table public.metric_alert_rule_recipients enable row level security;

-- Service role only, same posture as medication_stocks: RLS enabled with no
-- client policies denies all client access; the admin console reads/writes
-- these exclusively through the service-role API. This project's ACL
-- defaults grant nothing (20260702000000 / 20260711000000), so the
-- service-role grant must be explicit.
grant select, insert, update, delete on table public.metric_alert_rules to service_role;
grant select, insert, update, delete on table public.metric_alert_rule_recipients to service_role;
