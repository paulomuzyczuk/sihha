-- Profile-scoped clinician entries: the psychologist and the psychiatrist
-- each keep their own daily record. author_profile stores the specialist
-- profile that authored a clinician entry (null for every other role and for
-- a profile-less clinician), and the one-per-day overwrite rule
-- (API-enforced, see /api/logs) now applies per
-- (recipient, log_date, author_role, author_profile).

alter table care_log_entries
  add column if not exists author_profile text
  check (author_profile in ('psychologist', 'psychiatrist'));

-- Existing clinician entries inherit their author's current specialist
-- profile in the same circle.
update care_log_entries e
set author_profile = m.clinical_profile
from care_team_members m
where e.author_role = 'clinician'
  and e.author_profile is null
  and m.user_id = e.author_id
  and m.recipient_id = e.recipient_id;

-- The overwrite audit snapshots carry the same scope.
alter table care_log_revisions
  add column if not exists author_profile text
  check (author_profile in ('psychologist', 'psychiatrist'));

-- Defense in depth behind the API's role check: the insert policy now also
-- pins the entry's profile to the member's own clinical profile (both null
-- for non-clinician roles).
drop policy "members insert own entries" on care_log_entries;
create policy "members insert own entries"
  on care_log_entries for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = care_log_entries.recipient_id
        and m.user_id = auth.uid()
        and m.role::text in ('caregiver', 'clinician', 'recipient')
        and m.role::text = care_log_entries.author_role
        and m.clinical_profile is not distinct from care_log_entries.author_profile
    )
  );
