-- Document-type registry (admin console, institution tabs). Which document
-- types exist and whether they're active was implicit — hardcoded across
-- the upload routes (app/api/{invoices,prescriptions,evaluations}) and the
-- storage bucket config in supabase/seed.sql. This table makes the
-- ACTIVE/VISIBLE state and admin-facing copy editable PER INSTITUTION,
-- without touching bucket-level MIME/size limits (those stay governed by
-- storage.buckets, identical for every institution on one deployment —
-- Supabase Storage has no per-tenant bucket config, so this table does not
-- attempt to override it).
--
-- Rows are institution-scoped so one institution's customization can't
-- affect another's. Seeded to reproduce today's exact behavior (every type
-- active, no copy override) for every existing institution, so wiring a
-- route to read it is a no-op until an admin edits a row. An institution
-- with no row for a given doc_key falls back to "active, default copy" —
-- newly created institutions keep working without a seed step.
create table if not exists public.document_types (
  institution_id uuid not null
    references public.institutions (id) on delete cascade,
  -- Stable key an upload surface resolves config by. Not an enum: a future
  -- doc type is a data row, not a migration.
  doc_key    text not null check (char_length(doc_key) between 1 and 60),
  active     boolean not null default true,
  -- Locale-keyed admin copy override, e.g. {"pt": {"label": "..."}}.
  -- Empty = the form uses its built-in i18n copy.
  copy       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (institution_id, doc_key)
);

alter table public.document_types enable row level security;
grant select, insert, update, delete on table public.document_types to service_role;

-- Seed every existing institution with the three current doc types, active,
-- no copy override — byte-identical to today's hardcoded behavior.
insert into public.document_types (institution_id, doc_key)
select i.id, d.doc_key
from public.institutions i
cross join (values ('invoice'), ('prescription'), ('evaluation')) as d(doc_key)
on conflict (institution_id, doc_key) do nothing;
