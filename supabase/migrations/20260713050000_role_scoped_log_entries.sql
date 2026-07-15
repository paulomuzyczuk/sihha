-- Role-scoped check-ins (M6 follow-up): the recipient answers his own
-- scales (WHO-5) and the clinical team rates theirs (PHQ-9, BPRS), each in
-- their own daily entry. An entry now records the care role that authored
-- it; the one-per-day cadence applies per role, and each entry stores only
-- the values of the metrics that role fills (filled_by).

alter table care_log_entries
  add column if not exists author_role text
  check (author_role in ('owner', 'caregiver', 'clinician', 'recipient'));

-- Every existing entry came from the therapist flow
update care_log_entries set author_role = 'caregiver' where author_role is null;

alter table care_log_entries alter column author_role set not null;

-- Insert policy widens from caregiver-only to the roles that fill metrics,
-- each locked to their own membership role (defense in depth behind the
-- API's role check).
drop policy "caregivers insert own entries" on care_log_entries;
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
    )
  );
