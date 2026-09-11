-- Push notification analytics: web push gives no native delivery/open data, so
-- we record the lifecycle ourselves. The cron records a 'sent' row per device
-- with a per-send notification_id; the service worker reports 'displayed' (push
-- event fired) and 'opened' (notification tapped) back through /api/push/event,
-- keyed by that notification_id. Stats = sent -> displayed -> opened, per user,
-- with timestamps (time-to-open).
create table push_events (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  user_id         uuid not null references auth.users on delete cascade,
  kind            text not null,
  event           text not null check (event in ('sent', 'displayed', 'opened')),
  created_at      timestamptz not null default timezone('utc'::text, now()),
  -- one row per (send, lifecycle stage): a device re-firing 'opened' is a no-op,
  -- so open-rate counts stay honest.
  unique (notification_id, event)
);

create index push_events_notification_idx on push_events (notification_id);
create index push_events_user_created_idx on push_events (user_id, created_at);

-- Service-role only: written by the cron ('sent') and by /api/push/event
-- ('displayed'/'opened') via the admin client. The browser never touches this
-- table directly — it goes through the rate-limited event route.
alter table push_events enable row level security;
grant select, insert on table push_events to service_role;
