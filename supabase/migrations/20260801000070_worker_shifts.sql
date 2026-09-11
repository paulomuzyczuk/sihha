-- Weekly recurring worker shifts for the patient calendar ("Turnos", 2026-08-01)
-- — the third-party helpers who are physically present on a fixed weekly cadence
-- (the cleaning lady / diarista, and any future equivalent), projected onto the
-- calendar so the family can see coverage at a glance.
--
-- Deliberately NOT the care-logging rota, and deliberately NOT the therapeutic
-- companion. The companion is the `caregiver` care-team role; its shift days are
-- already the authoritative care-shift rota (care_shift_defaults +
-- care_shift_overrides), so the Turno calendar source derives companion days
-- from there rather than duplicating them here. This table holds only the
-- fixed-weekly workers that have no rota of their own.
--
-- Turnos never trigger a reminder (the calendar source emits them with no
-- reminderMinutes), so there is no reminder/alerting column here by design.
--
-- weekday is Mon=0 .. Sun=6, matching weekdayMon0FromDateStr and
-- care_shift_defaults.weekday — the one weekday convention used across the code.
-- start_time/end_time are recipient-LOCAL wall clock (interpreted in
-- care_recipients.timezone by the display and Google-push layers), the same
-- convention every other time-based read uses.
--
-- Protected store: like care_shift_defaults / appointments, NO client-facing RLS
-- policies. Reads go through the service-role calendar aggregator only. No seed
-- rows here — they reference a specific recipient_id (personal data), which
-- belongs in a seed script / one-off admin op, not a migration (M1 convention).
create table if not exists public.care_worker_shifts (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  worker_label text not null check (char_length(worker_label) between 1 and 120),
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null check (end_time > start_time),
  created_at   timestamptz not null default timezone('utc'::text, now()),
  -- one row per worker per weekday; the seed upsert relies on this to be idempotent.
  unique (recipient_id, worker_label, weekday)
);

-- The calendar range query loads every worker shift for a recipient at once.
create index if not exists care_worker_shifts_recipient_idx
  on public.care_worker_shifts (recipient_id);

alter table public.care_worker_shifts enable row level security;
grant select, insert, update, delete on table public.care_worker_shifts to service_role;
