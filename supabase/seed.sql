-- LOCAL-ONLY seed (runs on `supabase start` / `supabase db reset`, never on a
-- hosted deploy). Its whole job is to reproduce the storage buckets that
-- production creates out-of-band (dashboard / management API), so local dev and
-- the integration lane exercise the real upload paths. Migrations deliberately
-- do NOT create buckets: storage.objects policies are owned by
-- supabase_storage_admin on hosted projects, so bucket provisioning lives
-- outside the migration history. Here (local superuser) we can do both.
--
-- Path convention (all buckets): the first folder segment is the uploader's
-- auth.uid(), which every insert policy pins to, mirroring the reference
-- policies in the invoices / prescriptions / evaluations migrations.

-- 15 MB, matching the client-side maxBytes in every upload form.
-- ALL buckets are PRIVATE: invoices hold financial documents, prescriptions and
-- evaluations hold medical ones. Reads go through signed-URL routes (e.g.
-- GET /api/invoices/file) that authorize the caller before minting a
-- short-lived link — never a permanent public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('invoices', 'invoices', false, 15728640,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('prescriptions', 'prescriptions', false, 15728640,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('evaluations', 'evaluations', false, 15728640,
   array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Own-folder insert policies (one per bucket). Public read on 'invoices' is
-- served by the bucket's public flag, so no select policy is needed.
drop policy if exists "owners upload own invoices" on storage.objects;
create policy "owners upload own invoices" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "clinicians upload own prescriptions" on storage.objects;
create policy "clinicians upload own prescriptions" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "psychologists upload own evaluations" on storage.objects;
create policy "psychologists upload own evaluations" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evaluations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
