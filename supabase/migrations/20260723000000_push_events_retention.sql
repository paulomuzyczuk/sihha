-- Engagement-telemetry retention (audit A9, posture decided 2026-07-23):
-- the dashboard rule is AGGREGATE-ONLY (circle-level summaries, no per-person
-- drill-down in v1), circle members get an in-app notice at push opt-in, and
-- raw per-event telemetry is purged after 90 days — past its care-coordination
-- window the event log is a toxic asset, while daily aggregates (dbt marts,
-- D7) carry the long-term trends. email_events adopts the same rule when D5
-- lands.
--
-- pg_cron runs the purge in-database: no app route, no third Vercel cron
-- (the Hobby plan's two daily slots are already taken by the alert crons).
create extension if not exists pg_cron;

select cron.schedule(
  'purge-push-events-90d',
  '30 3 * * *', -- daily, off-peak UTC
  $$delete from push_events where created_at < now() - interval '90 days'$$
);
