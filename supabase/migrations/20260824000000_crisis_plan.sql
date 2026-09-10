-- Crisis plan as recipient-scoped DATA (2026-08-24, stage 1 of the crisis-plan
-- redesign). Replaces components/crisisPlanData.ts, which hardcoded one
-- recipient's escalation plan — five real people with full phone numbers — as
-- committed TypeScript. Two goals in one change: get the personal data out of
-- source, and make the feature generic enough that a self-hoster can define
-- their own protocols (it is an included cluster in CHARTER.md).
--
-- EXPAND ONLY (A24). Nothing reads these tables yet. The backfill script fills
-- them, the service/API/view land in a later deploy, and crisisPlanData.ts is
-- deleted only after the DB-backed render is verified in production.
--
-- Protected store: like care_log_entries and lab_results, NO client-facing RLS
-- policies and SELECT granted to service_role only. Reads go through
-- authorizeCareRequest + the service-role client. A crisis plan names
-- clinicians and family with their phone numbers; it is PHI-adjacent by
-- construction. No seed rows here — they would reference a specific
-- recipient_id (personal data), which belongs in a backfill script, not a
-- migration (M1 convention).
--
-- Every section of the old hardcoded plan falls out of this shape with no
-- special cases, which is what lets the view render "whatever protocols exist"
-- rather than four named sections:
--   decision chain -> a protocol whose steps are contact refs; is_fallback
--                     marks the backup decider
--   clinic         -> a protocol carrying the facility_* columns; its steps
--                     are the admission contacts
--   aggression     -> a protocol with `responsible` set and ordered steps, one
--                     of which carries a contact
--   backup roles   -> steps with role_label set and contact_id null; that null
--                     IS the "to be defined" state the view already renders

create table if not exists public.crisis_contacts (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.care_recipients (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  -- Display format ('+55 11 95555-0000'); the tel:/wa.me targets are derived
  -- in lib/crisisPlan/contactLinks.ts, never stored.
  phone         text not null check (char_length(phone) between 1 and 40),
  -- true = answers WhatsApp only; the view renders a wa.me link, not tel:.
  whatsapp_only boolean not null default false,
  created_at    timestamptz not null default timezone('utc'::text, now()),
  -- One row per named contact per recipient; the backfill upsert relies on
  -- this to be idempotent.
  unique (recipient_id, name)
);

create table if not exists public.crisis_protocols (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.care_recipients (id) on delete cascade,
  -- Stable identifier for a protocol within a recipient's plan; the backfill
  -- and any future template seeding upsert on it.
  slug          text not null check (char_length(slug) between 1 and 60),
  title         text not null check (char_length(title) between 1 and 160),
  -- Optional grouping: protocols sharing a section_title render under one
  -- heading. Kept as DATA rather than hardcoded sections so the current plan's
  -- "Agressão -> mild / backup / severe" grouping survives the move without
  -- the view knowing those names. Null = the protocol stands alone.
  section_title text check (char_length(section_title) between 1 and 160),
  -- Who carries out this protocol, as free text ("the companions on duty").
  responsible   text check (char_length(responsible) between 1 and 300),
  note          text check (char_length(note) between 1 and 2000),
  -- Set only on a protocol describing an admission/transfer destination.
  facility_name      text check (char_length(facility_name) between 1 and 160),
  facility_city      text check (char_length(facility_city) between 1 and 160),
  -- Null renders as the localised "to be defined" placeholder, not as blank.
  facility_transport text check (char_length(facility_transport) between 1 and 300),
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default timezone('utc'::text, now()),
  unique (recipient_id, slug)
);

create table if not exists public.crisis_protocol_steps (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.crisis_protocols (id) on delete cascade,
  sort_order  smallint not null,
  -- Named step_text, not `text`: a column literally called `text` reads as the
  -- type name in every query and greps uselessly (CLAUDE.md naming rule).
  -- Nullable because a decision-chain step is a bare contact reference with no
  -- prose of its own.
  step_text   text check (char_length(step_text) between 1 and 1000),
  -- on delete restrict, NOT set null: dropping a contact must be a deliberate
  -- edit of the steps that call them. Silently downgrading "call Dr X" to an
  -- untargeted step is the kind of quiet failure that only surfaces mid-crisis.
  contact_id  uuid references public.crisis_contacts (id) on delete restrict,
  -- A role that has no person assigned yet ("neighbour"). role_label set with
  -- contact_id null is the "to be defined" state.
  role_label  text check (char_length(role_label) between 1 and 160),
  -- Marks the fallback in an ordered chain (the second decider, the backup
  -- admission contact).
  is_fallback boolean not null default false,
  created_at  timestamptz not null default timezone('utc'::text, now()),
  -- A step with nothing in it renders as a blank line in a list someone is
  -- reading mid-episode. Cheap to block here, expensive to notice there.
  constraint crisis_protocol_steps_not_empty check (
    step_text is not null or contact_id is not null or role_label is not null
  ),
  -- Deterministic order within a protocol; also makes the backfill idempotent.
  unique (protocol_id, sort_order)
);

-- The plan is always loaded whole, per recipient: contacts and protocols by
-- recipient_id, then steps by protocol.
create index if not exists crisis_contacts_recipient_idx
  on public.crisis_contacts (recipient_id);
create index if not exists crisis_protocols_recipient_idx
  on public.crisis_protocols (recipient_id, sort_order);
create index if not exists crisis_protocol_steps_protocol_idx
  on public.crisis_protocol_steps (protocol_id, sort_order);
-- Supports the on-delete-restrict check when a contact is removed.
create index if not exists crisis_protocol_steps_contact_idx
  on public.crisis_protocol_steps (contact_id);

alter table public.crisis_contacts enable row level security;
alter table public.crisis_protocols enable row level security;
alter table public.crisis_protocol_steps enable row level security;

grant select, insert, update, delete on table public.crisis_contacts to service_role;
grant select, insert, update, delete on table public.crisis_protocols to service_role;
grant select, insert, update, delete on table public.crisis_protocol_steps to service_role;
