-- Alert delivery ledger (audit A2, 2026-07-22). The safety-critical alerting
-- chain (PHQ-9 escalation, low stock, missing-log, fill-reminder) previously
-- discarded send outcomes: a failed Resend call left no queryable trace. This
-- table mirrors push_events' posture — one row per outbound alert attempt,
-- service-role only — so delivery failures are observable and the engagement
-- dashboard (A25) has honest data.
--
-- alert_date is the care-day the alert refers to (recipient-local), giving the
-- crons a per-(recipient, date, kind) sent-marker for idempotent re-runs (A4).
--
-- target holds an e-mail address or a user-id count summary; like push_events'
-- user_id this is circle-member PII, acceptable here because the table has no
-- client SELECT policy and is only reachable through the service-role client.
create table alert_events (
  id           uuid primary key default gen_random_uuid(),
  -- nullable: platform-level critical escalations are not recipient-scoped
  recipient_id uuid references care_recipients on delete cascade,
  kind         text not null check (
    kind in ('metric_alert', 'low_stock', 'missing_log', 'fill_reminder', 'critical')
  ),
  channel      text not null check (channel in ('email', 'push')),
  target       text not null,
  outcome      text not null check (outcome in ('sent', 'failed')),
  detail       text,
  alert_date   date,
  created_at   timestamptz not null default timezone('utc'::text, now())
);

-- Sent-marker lookups (A4) and per-recipient delivery queries
create index alert_events_recipient_kind_date_idx
  on alert_events (recipient_id, kind, alert_date);
create index alert_events_created_idx on alert_events (created_at);

alter table alert_events enable row level security;
grant select, insert on table alert_events to service_role;
