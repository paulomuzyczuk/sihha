-- Structured clinical profile on the membership (M8): psychologist and
-- psychiatrist share the 'clinician' care role but give different inputs
-- (per-profile scales, prescription upload, session feedback). The profile
-- lives here — NOT on the legacy write-only user_profiles table (slated for
-- drop) and NOT as a new care role (access and identity vocabularies stay
-- separate; see lib/constants.ts).
alter table public.care_team_members
  add column if not exists clinical_profile text
  check (clinical_profile in ('therapist', 'psychologist', 'psychiatrist'));

-- Backfill from the free-text member_label written at invite time (pt or en
-- UI). Rows that match nothing stay null — a null-profile clinician sees only
-- profile-agnostic metrics and no prescription upload; fix stragglers by hand:
--   select * from care_team_members where role = 'clinician' and clinical_profile is null;
update public.care_team_members set clinical_profile = 'psychologist'
  where clinical_profile is null
    and (lower(member_label) like 'psicólog%'
         or lower(member_label) like 'psicolog%'
         or lower(member_label) like 'psycholog%');
update public.care_team_members set clinical_profile = 'psychiatrist'
  where clinical_profile is null
    and (lower(member_label) like 'psiquiatr%'
         or lower(member_label) like 'psychiatr%');
update public.care_team_members set clinical_profile = 'therapist'
  where clinical_profile is null
    and (lower(member_label) like 'terapeut%'
         or lower(member_label) like 'therapist%');
