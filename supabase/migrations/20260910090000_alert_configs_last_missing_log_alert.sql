-- Idempotency marker for the missing-log cron (scoped-down A4: public has a
-- single cron route, not flagship's multi-channel alert ledger). Without it,
-- a retried or manually re-triggered run on the same recipient-local day
-- would re-send the alert every time the log is still missing, since the
-- cron itself carried no per-day dispatch record.
alter table public.alert_configs
  add column if not exists last_missing_log_alert_date date;
