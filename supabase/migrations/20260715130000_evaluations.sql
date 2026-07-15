-- Psychologist evaluation documents (M10). The psychologist uploads the raw
-- test-result PDF (laudo psicométrico / neuropsychological report) so the
-- circle keeps the source document. Distinct from psychometric_results, which
-- holds the flattened per-score rows the dashboard charts — this table stores
-- the file itself, one row per uploaded document. Mirrors the prescriptions
-- posture: client-write-only (no select policy — future readers go through a
-- service-role route with signed URLs), RLS insert tied to the caller's own
-- user_id + clinician membership, psychologist clinical profile enforced at the
-- DB so the /api/evaluations route's profile check is real defense in depth.
create table if not exists public.evaluations (
  id            uuid primary key,
  recipient_id  uuid not null references public.care_recipients (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  file_url      text not null,
  notes         text check (char_length(notes) <= 1000),
  created_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.evaluations enable row level security;

create policy "psychologists insert own evaluations"
  on public.evaluations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.care_team_members m
      where m.recipient_id = evaluations.recipient_id
        and m.user_id = auth.uid()
        and m.role = 'clinician'
        and m.clinical_profile = 'psychologist'
    )
  );

-- This project's ACL defaults grant nothing (see 20260702000000 /
-- 20260711000000), so both the client insert and service-role access need
-- explicit grants.
grant insert on table public.evaluations to authenticated;
grant select, insert on table public.evaluations to service_role;

-- Storage: the 'evaluations' bucket is PRIVATE (medical documents — same
-- posture as 'prescriptions', not the public 'invoices' bucket) and is created
-- out-of-band (dashboard or management API) because storage.objects policies
-- are owned by supabase_storage_admin on hosted projects. Reference policy:
--   create policy "psychologists upload own evaluations"
--     on storage.objects for insert to authenticated
--     with check (
--       bucket_id = 'evaluations'
--       and (storage.foldername(name))[1] = auth.uid()::text
--     );
