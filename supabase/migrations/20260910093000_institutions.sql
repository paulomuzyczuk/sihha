-- Multi-tenant institution layer. Until now the whole deployment was one
-- implicit tenant: care_recipients was the only isolation unit and "admin"
-- was a single global platform superuser (ROLES.ADMIN in the JWT). To let
-- several independent institutions share one instance, a tenant entity sits
-- ABOVE care_recipients — an institution groups a set of recipients and a
-- set of staff, with its own institution-scoped admin (institution_role =
-- 'institution_admin'). Nothing below the recipient level changes — the
-- existing care_team_members/RLS model is untouched.

-- Institution-scoped authority. Distinct from care_team_members.role (which
-- scopes a user to one recipient) and from the JWT app_metadata.role
-- platform tier: this says "may administer THIS institution's staff and
-- recipients".
create type institution_role as enum ('institution_admin', 'institution_staff');

create table institutions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 200),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  -- 'suspended' lets an operator cut off a non-paying/abusive institution
  -- without deleting its data; the app treats non-'active' as read-blocked.
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table institution_members (
  institution_id  uuid not null references institutions (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  institution_role institution_role not null,
  created_at      timestamptz not null default timezone('utc'::text, now()),
  primary key (institution_id, user_id)
);

create index institution_members_user_idx
  on institution_members (user_id);

-- Tie every recipient to exactly one institution. Nullable HERE so the
-- backfill (20260910093010) can assign existing rows before
-- 20260910093020 makes it NOT NULL — a three-step add-backfill-constrain so
-- no row is ever orphaned (expand/contract discipline: schema-drop/rename
-- steps never share a deploy with the data move that depends on them).
-- on delete restrict: deleting an institution must never silently
-- cascade-wipe patient records; an institution with recipients cannot be
-- dropped by accident.
alter table care_recipients
  add column institution_id uuid references institutions (id) on delete restrict;

create index care_recipients_institution_idx
  on care_recipients (institution_id);

-- RLS. institutions: service-role only (deny-all to clients), same posture
-- as care_recipients — institution data is served through the service-role
-- API, never read directly by the browser. institution_members: clients
-- read only their OWN rows (login/routing can tell which institution(s) a
-- user belongs to), mirroring "users read own memberships" on
-- care_team_members. No client SELECT of other members — the
-- institution-scoped admin/users API returns those, service-side.
alter table institutions enable row level security;
alter table institution_members enable row level security;

create policy "users read own institution memberships"
  on institution_members for select
  to authenticated
  using (user_id = auth.uid());

grant all on table institutions to service_role;
grant all on table institution_members to service_role;
grant select on table institution_members to authenticated;
