-- Care agreement ("contrato de convivência") as recipient-scoped, VERSIONED
-- data (2026-08-24). Replaces components/careContractData.ts, which hardcoded
-- one household's agreement — four named witnesses, the allowance, and clinical
-- and financial terms about a fifth person — as committed TypeScript.
--
-- EXPAND ONLY (A24). Nothing reads these tables yet; the backfill fills them,
-- the read path lands in a later deploy, and the constants are deleted only
-- after the DB-backed render is verified in production.
--
-- Protected store: like the crisis plan and care_log_entries, RLS on with NO
-- client-facing policies and SELECT granted to service_role only. Reads go
-- through authorizeCareRequest + the service-role client.
--
-- VERSIONED, unlike the crisis plan, because this is an AGREEMENT: the parties
-- signed a specific text on a specific date, and "what did we agree to in May"
-- is a question everyone bound by it may legitimately ask. So a version is
-- IMMUTABLE once written — an amendment inserts a new version rather than
-- editing the old one, and every party can read the whole history. That also
-- makes the editor far simpler than the crisis plan's: a save is an insert, so
-- there is no diffing and no chance of a partial update.
--
-- The current agreement is the highest version_number for the recipient. No
-- is_current flag: two rows could disagree, and a flag needs a transaction to
-- stay honest where max() cannot lie.

create table if not exists public.care_contract_versions (
  id                uuid primary key default gen_random_uuid(),
  recipient_id      uuid not null references public.care_recipients (id) on delete cascade,
  version_number    integer not null check (version_number > 0),
  -- The date the parties agreed this text, which is NOT created_at: a version
  -- may be entered into the system days after it was signed.
  agreed_on         date not null,
  -- Display text with its currency marker ('R$100' — a placeholder, not this
  -- deployment's figure), interpolated into the localised reward copy.
  -- Nullable: not every agreement carries an allowance.
  monthly_allowance text check (char_length(monthly_allowance) between 1 and 60),
  created_at        timestamptz not null default timezone('utc'::text, now()),
  unique (recipient_id, version_number)
);

create table if not exists public.care_contract_sections (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.care_contract_versions (id) on delete cascade,
  -- Sections sharing a group_title render under one card; null stands alone.
  -- Grouping is DATA so the view hardcodes no section names — the same rule the
  -- crisis plan follows, and what lets a self-hoster write their own agreement.
  group_title text check (char_length(group_title) between 1 and 160),
  title       text not null check (char_length(title) between 1 and 160),
  sort_order  smallint not null,
  unique (version_id, sort_order)
);

create table if not exists public.care_contract_clauses (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.care_contract_sections (id) on delete cascade,
  sort_order  smallint not null,
  -- Named clause_text, not `text`: a column called `text` reads as the type
  -- name in every query and greps uselessly (CLAUDE.md naming rule).
  clause_text text not null check (char_length(clause_text) between 1 and 1000),
  unique (section_id, sort_order)
);

-- Signatories, not clauses: they witness the agreement rather than commit to
-- anything in it, and the view renders them in the signature block.
create table if not exists public.care_contract_witnesses (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.care_contract_versions (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  sort_order smallint not null,
  unique (version_id, sort_order)
);

-- The version list is read on every contract view (the version picker), and the
-- current version is max(version_number) per recipient.
create index if not exists care_contract_versions_recipient_idx
  on public.care_contract_versions (recipient_id, version_number desc);
create index if not exists care_contract_sections_version_idx
  on public.care_contract_sections (version_id, sort_order);
create index if not exists care_contract_clauses_section_idx
  on public.care_contract_clauses (section_id, sort_order);
create index if not exists care_contract_witnesses_version_idx
  on public.care_contract_witnesses (version_id, sort_order);

alter table public.care_contract_versions  enable row level security;
alter table public.care_contract_sections  enable row level security;
alter table public.care_contract_clauses   enable row level security;
alter table public.care_contract_witnesses enable row level security;

grant select, insert, update, delete on table public.care_contract_versions  to service_role;
grant select, insert, update, delete on table public.care_contract_sections  to service_role;
grant select, insert, update, delete on table public.care_contract_clauses   to service_role;
grant select, insert, update, delete on table public.care_contract_witnesses to service_role;
