import { SupabaseClient } from '@supabase/supabase-js';
import { loadGoalInputs } from '../../services/goalInputs';
import { chain } from '../helpers/careTeamMock';

describe('loadGoalInputs', () => {
  it('scopes invoice_items to grocery-doc_type invoices', async () => {
    const itemsTable = chain({ data: [] });
    const db = {
      from: (table: string) => {
        if (table === 'invoice_items') return itemsTable;
        return chain({ data: [] });
      },
    } as unknown as SupabaseClient;

    await loadGoalInputs(db, 'recipient-1', '2026-09-01', '2026-09-30');

    expect(itemsTable.eq).toHaveBeenCalledWith('recipient_id', 'recipient-1');
    expect(itemsTable.eq).toHaveBeenCalledWith('invoices.doc_type', 'grocery');
  });

  it('returns items and folds the grocery-share metric/entries in', async () => {
    const items = [
      {
        purchase_date: '2026-09-05',
        amount_cents: 1000,
        discretionary: false,
        category: 'arroz',
      },
    ];
    const db = {
      from: (table: string) => {
        if (table === 'invoice_items') return chain({ data: items });
        return chain({ data: [] });
      },
    } as unknown as SupabaseClient;

    const { inputs, error } = await loadGoalInputs(
      db,
      'recipient-1',
      '2026-09-01',
      '2026-09-30',
    );

    expect(error).toBeNull();
    expect(inputs?.items).toEqual(items);
    expect(
      inputs?.definitions.some((d) => d.key === 'grocery_discretionary_share'),
    ).toBe(true);
  });
});
