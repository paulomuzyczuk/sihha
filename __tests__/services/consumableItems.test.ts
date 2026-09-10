import {
  daysOfSupplyRemaining,
  isLowStock,
  listConsumableItems,
  createConsumableItem,
  recountConsumableItem,
  type ConsumableItem,
} from '../../services/consumableItems';
import { chain } from '../helpers/careTeamMock';

function makeItem(overrides: Partial<ConsumableItem> = {}): ConsumableItem {
  return {
    id: 'item-1',
    recipient_id: 'recipient-1',
    name: 'Fraldas geriátricas',
    unit: 'pack',
    current_quantity: 10,
    daily_usage_rate: 2,
    low_stock_threshold_days: 3,
    active: true,
    ...overrides,
  };
}

describe('daysOfSupplyRemaining', () => {
  it('divides current quantity by the daily usage rate', () => {
    expect(daysOfSupplyRemaining(makeItem())).toBe(5);
  });

  it('handles a fractional result', () => {
    expect(
      daysOfSupplyRemaining(
        makeItem({ current_quantity: 5, daily_usage_rate: 2 }),
      ),
    ).toBe(2.5);
  });

  it('returns 0 when the current quantity is exhausted', () => {
    expect(daysOfSupplyRemaining(makeItem({ current_quantity: 0 }))).toBe(0);
  });

  it('throws rather than divide by a non-positive usage rate', () => {
    expect(() =>
      daysOfSupplyRemaining(makeItem({ daily_usage_rate: 0 })),
    ).toThrow(/daily_usage_rate/);
    expect(() =>
      daysOfSupplyRemaining(makeItem({ daily_usage_rate: -1 })),
    ).toThrow(/daily_usage_rate/);
  });
});

describe('isLowStock', () => {
  it('is false when days remaining exceeds the threshold', () => {
    expect(
      isLowStock(
        makeItem({
          current_quantity: 10,
          daily_usage_rate: 1,
          low_stock_threshold_days: 3,
        }),
      ),
    ).toBe(false);
  });

  it('is true exactly at the threshold boundary', () => {
    expect(
      isLowStock(
        makeItem({
          current_quantity: 3,
          daily_usage_rate: 1,
          low_stock_threshold_days: 3,
        }),
      ),
    ).toBe(true);
  });

  it('is true below the threshold', () => {
    expect(
      isLowStock(
        makeItem({
          current_quantity: 1,
          daily_usage_rate: 1,
          low_stock_threshold_days: 3,
        }),
      ),
    ).toBe(true);
  });
});

describe('listConsumableItems', () => {
  it('queries consumable_items filtered by recipient', async () => {
    const table = chain({ data: [makeItem()] });
    const adminDb = { from: () => table } as never;
    const result = await listConsumableItems(adminDb, 'recipient-1');
    expect(table.eq).toHaveBeenCalledWith('recipient_id', 'recipient-1');
    expect(result).toEqual([makeItem()]);
  });

  it('returns an empty array when the query yields no rows', async () => {
    const table = chain({ data: null });
    const adminDb = { from: () => table } as never;
    expect(await listConsumableItems(adminDb, 'recipient-1')).toEqual([]);
  });
});

describe('createConsumableItem', () => {
  it('inserts a row scoped to the recipient', async () => {
    const table = chain({ data: makeItem() });
    const adminDb = { from: () => table } as never;
    await createConsumableItem(adminDb, 'recipient-1', {
      name: 'Fraldas geriátricas',
      unit: 'pack',
      current_quantity: 10,
      daily_usage_rate: 2,
    });
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'recipient-1',
        name: 'Fraldas geriátricas',
        unit: 'pack',
        current_quantity: 10,
        daily_usage_rate: 2,
      }),
    );
  });
});

describe('recountConsumableItem', () => {
  it('updates current_quantity and updated_at for the given item', async () => {
    const table = chain({ data: makeItem({ current_quantity: 4 }) });
    const adminDb = { from: () => table } as never;
    await recountConsumableItem(adminDb, 'item-1', 4);
    expect(table.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_quantity: 4 }),
    );
    expect(table.eq).toHaveBeenCalledWith('id', 'item-1');
  });
});
