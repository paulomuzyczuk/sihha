-- Backfill: fold the existing single-tenant deployment into one institution
-- so 20260910093020 can safely make care_recipients.institution_id NOT
-- NULL. Idempotent — safe to re-run. No personal data in migrations (see
-- the Migrations convention in CLAUDE.md): the institution gets a generic
-- placeholder name/slug — an operator renames it later via the admin
-- console.
--
-- Unlike flagship (already-running production, never recipient-less), this
-- ALWAYS ensures a default institution exists, even on a completely fresh
-- self-hosted deployment with zero care_recipients yet (`supabase db
-- reset` + first admin login): institutions have no client-writable path
-- (service-role only RLS), so the very first one must come from a
-- migration, or a fresh deployment's admin could never create the first
-- recipient (POST /api/admin/recipients requires an institution to stamp).
do $$
declare
  default_institution_id uuid;
begin
  select id into default_institution_id from institutions where slug = 'default';
  if default_institution_id is null then
    insert into institutions (name, slug)
      values ('Default Institution', 'default')
      returning id into default_institution_id;
  end if;

  update care_recipients
    set institution_id = default_institution_id
    where institution_id is null;

  -- Every user who belongs to any circle becomes a member of the
  -- institution — institution-scoped admin routes (e.g. "list users in my
  -- institution") need a complete roster, not just the admins. Platform
  -- ADMINs and circle owners become institution_admin (so the institution
  -- is never left without an administrator); everyone else is
  -- institution_staff. A platform ADMIN with zero circles yet (the fresh
  -- single-admin deployment) still gets seeded, so they can create the
  -- first one.
  insert into institution_members (institution_id, user_id, institution_role)
  select
    default_institution_id,
    u.id,
    case
      when (u.raw_app_meta_data ->> 'role') = 'ADMIN'
        or exists (
          select 1 from care_team_members owner_m
          where owner_m.user_id = u.id and owner_m.role = 'owner'
        )
      then 'institution_admin'::institution_role
      else 'institution_staff'::institution_role
    end
  from auth.users u
  where exists (select 1 from care_team_members m where m.user_id = u.id)
     or (u.raw_app_meta_data ->> 'role') = 'ADMIN'
  on conflict (institution_id, user_id) do nothing;
end $$;
