-- M7 Supermercado pipeline: Claude reads each uploaded invoice image and
-- classifies every line item (discretionary vs essential). One row per line
-- item; the Supermercado goal computes the discretionary share of grocery
-- spend from this table instead of a manually-entered percentage.
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  recipient_id uuid not null references public.care_recipients (id) on delete cascade,
  -- Receipt date read from the document; falls back to the upload date
  purchase_date date not null,
  description text not null,
  quantity numeric,
  amount_cents integer not null,
  -- Free-text pt-BR category from the classifier (e.g. 'doces', 'limpeza')
  category text not null,
  discretionary boolean not null,
  -- Model that produced the classification, for auditability
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_recipient_date_idx
  on public.invoice_items (recipient_id, purchase_date);

-- Server-only table: RLS on with no client policies; this project's ACL
-- defaults grant nothing, so service_role needs explicit privileges.
alter table public.invoice_items enable row level security;
grant select, insert, update, delete on table public.invoice_items to service_role;

-- Processing bookkeeping on invoices. processed_at set even on failure so a
-- broken document doesn't loop forever; null it manually to retry.
alter table public.invoices add column if not exists doc_type text;
alter table public.invoices add column if not exists processed_at timestamptz;
alter table public.invoices add column if not exists processing_error text;
grant select, update on table public.invoices to service_role;
