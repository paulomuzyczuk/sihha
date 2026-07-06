-- M3: membership-based client access (docs/architecture.md).
-- The application switches from JWT-tier authorization to care_team_members
-- lookups. Client-facing policies stay minimal: users read their own
-- memberships (login routing), caregivers insert their own log entries
-- (defense in depth behind the API role check, mirroring the legacy
-- care_logs pattern), and invoice inserts get a membership-based policy so
-- newly invited 'recipient'/'owner' members work without JWT tiers.

-- care_team_members: each user may read only their own membership rows
create policy "users read own memberships"
  on care_team_members for select
  to authenticated
  using (user_id = auth.uid());

grant select on table care_team_members to authenticated;

-- care_log_entries: caregivers insert their own entries into circles they
-- belong to. No client SELECT — reads remain aggregates-only via the API.
create policy "caregivers insert own entries"
  on care_log_entries for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = care_log_entries.recipient_id
        and m.user_id = auth.uid()
        and m.role = 'caregiver'
    )
  );

grant insert on table care_log_entries to authenticated;

-- invoices: membership-based insert (recipient self-service or owner),
-- alongside the legacy JWT-tier policy which keeps existing accounts working.
create policy "members insert invoices"
  on invoices for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from care_team_members m
      where m.recipient_id = invoices.recipient_id
        and m.user_id = auth.uid()
        and m.role in ('recipient', 'owner')
    )
  );
