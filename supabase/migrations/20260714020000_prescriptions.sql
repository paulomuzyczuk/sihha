-- Psychiatrist prescription documents (M8). Mirrors the invoices posture:
-- client-write-only (no select policy — future readers go through a
-- service-role route with signed URLs), RLS insert tied to the caller's own
-- user_id + clinician membership in the circle. The psychiatrist-only rule is
-- an API-layer check (membership.clinical_profile), symmetric with how
-- filled_by scopes log entries.
create table if not exists public.prescriptions (
  id            uuid primary key,
  recipient_id  uuid not null references public.care_recipients (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  file_url      text not null,
  notes         text check (char_length(notes) <= 1000),
  created_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.prescriptions enable row level security;

create policy "clinicians insert own prescriptions"
  on public.prescriptions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.care_team_members m
      where m.recipient_id = prescriptions.recipient_id
        and m.user_id = auth.uid()
        and m.role::text = 'clinician'
    )
  );

-- This project's ACL defaults grant nothing (see 20260702000000 /
-- 20260711000000), so both the client insert and service-role access need
-- explicit grants.
grant insert on table public.prescriptions to authenticated;
grant select, insert on table public.prescriptions to service_role;

-- Storage: the 'prescriptions' bucket is PRIVATE (medical documents — a
-- deliberate divergence from the public 'invoices' bucket) and is created
-- out-of-band (dashboard or management API) because storage.objects policies
-- are owned by supabase_storage_admin on hosted projects. Reference policy:
--   create policy "clinicians upload own prescriptions"
--     on storage.objects for insert to authenticated
--     with check (
--       bucket_id = 'prescriptions'
--       and (storage.foldername(name))[1] = auth.uid()::text
--     );
