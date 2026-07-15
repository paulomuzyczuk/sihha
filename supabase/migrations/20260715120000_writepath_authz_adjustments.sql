-- Write-path authorization adjustments (2026-07-15)
--   1. invoices: caregivers may now upload too (alongside recipient + owner).
--   2. prescriptions: restrict to the psychiatrist clinical profile at the DB.
--      The /api/prescriptions route already enforced this; RLS now matches, so
--      the "defense in depth" the route comment claims is real end to end.
--   3. psychometric_results: NEW user write path — the psychologist fills test
--      results. Service-role ingestion of PDF laudos still bypasses RLS, so its
--      inserts (author_id left null) are unaffected.

-- 1. invoices: add caregiver -------------------------------------------------
drop policy if exists "members insert invoices" on invoices;
create policy "members insert invoices" on invoices
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = invoices.recipient_id
        and m.user_id = auth.uid()
        and m.role = any (array['recipient', 'owner', 'caregiver']::care_role[])
    )
  );

-- 2. prescriptions: psychiatrist clinical profile only -----------------------
drop policy if exists "clinicians insert own prescriptions" on prescriptions;
create policy "clinicians insert own prescriptions" on prescriptions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = prescriptions.recipient_id
        and m.user_id = auth.uid()
        and m.role = 'clinician'
        and m.clinical_profile = 'psychiatrist'
    )
  );

-- 3. psychometric_results: psychologist write path ---------------------------
-- Provenance column: who entered it (null for the service-role PDF ingestion).
alter table psychometric_results
  add column if not exists author_id uuid references auth.users (id);

grant insert on psychometric_results to authenticated;

drop policy if exists "psychologists insert test results" on psychometric_results;
create policy "psychologists insert test results" on psychometric_results
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = psychometric_results.recipient_id
        and m.user_id = auth.uid()
        and m.role = 'clinician'
        and m.clinical_profile = 'psychologist'
    )
  );
