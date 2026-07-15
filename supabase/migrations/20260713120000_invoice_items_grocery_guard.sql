-- Guardrail: discretionary classification only exists for grocery invoices.
-- The classifier runs outside this codebase, so the contract is enforced at
-- the database boundary: invoice_items rows are rejected unless the parent
-- invoice is already stamped doc_type = 'grocery'. Processors must therefore
-- stamp doc_type before inserting line items.
create or replace function public.invoice_items_grocery_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.invoices
    where id = new.invoice_id
      and doc_type = 'grocery'
  ) then
    raise exception
      'invoice_items only accepts line items for grocery invoices; stamp invoices.doc_type = ''grocery'' first (invoice %)',
      new.invoice_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_items_grocery_only on public.invoice_items;
create trigger invoice_items_grocery_only
  before insert or update of invoice_id on public.invoice_items
  for each row
  execute function public.invoice_items_grocery_only();
