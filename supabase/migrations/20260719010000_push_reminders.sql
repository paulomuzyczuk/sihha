-- Fill-reminder notifications (M15): at the configured recipient-local hour
-- (21h for the flagship — the daily Vercel cron fires 01:00 UTC, which IS
-- 21:00 America/Campo_Grande) a cron nudges whoever owes the day's entry:
-- the therapist (caregiver role) on visit days, the recipient's self
-- check-in (M14) on solo days. Sent as web push + e-mail.

-- The deadline hour; NULL = reminders off (missing_log_hour pattern).
alter table alert_configs
  add column if not exists fill_reminder_hour smallint
    check (fill_reminder_hour between 0 and 23);

-- Recipient-local weekdays with a therapist on duty (Monday = 0, the
-- schedule_config convention). NULL = no schedule configured — the reminder
-- then goes to BOTH roles while the day has no entry from either.
alter table alert_configs
  add column if not exists caregiver_days smallint[]
    check (
      caregiver_days is null
      or caregiver_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    );

-- One row per browser push subscription; a user may hold several (phone,
-- laptop). The push-service endpoint is the identity — resubscribing from
-- the same browser upserts on it, even across account switches.
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- Service-role only, like the other clinical tables: clients subscribe
-- through /api/push (membership-authorized); the cron reads via admin client.
alter table push_subscriptions enable row level security;
grant select, insert, update, delete on push_subscriptions to service_role;
