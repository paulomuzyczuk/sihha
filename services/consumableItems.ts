import { SupabaseClient } from '@supabase/supabase-js';

// Consumable/medical-supply counting (admin console): a deliberately smaller
// sibling of the medication_stocks domain (services/stock.ts) — a usage RATE
// instead of a dosage schedule, no restock/recount audit trail. Reads and
// writes go through the admin API only (consumable_items has no client RLS
// policy at all).

export interface ConsumableItem {
  id: string;
  recipient_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  daily_usage_rate: number;
  low_stock_threshold_days: number;
  active: boolean;
}

export interface NewConsumableItem {
  name: string;
  unit: string;
  current_quantity: number;
  daily_usage_rate: number;
  low_stock_threshold_days?: number;
}

/** Days of supply left at the item's current usage rate. */
export function daysOfSupplyRemaining(item: ConsumableItem): number {
  if (item.daily_usage_rate <= 0) {
    throw new Error(
      `daysOfSupplyRemaining: expected positive daily_usage_rate, got ${item.daily_usage_rate}`,
    );
  }
  return item.current_quantity / item.daily_usage_rate;
}

/** Whether the item has fallen at or below its own low-stock threshold. */
export function isLowStock(item: ConsumableItem): boolean {
  return daysOfSupplyRemaining(item) <= item.low_stock_threshold_days;
}

export async function listConsumableItems(
  adminDb: SupabaseClient,
  recipientId: string,
): Promise<ConsumableItem[]> {
  const { data } = await adminDb
    .from('consumable_items')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('name');
  return (data as ConsumableItem[] | null) ?? [];
}

export async function createConsumableItem(
  adminDb: SupabaseClient,
  recipientId: string,
  input: NewConsumableItem,
): Promise<{ data: ConsumableItem | null; error: unknown }> {
  const { data, error } = await adminDb
    .from('consumable_items')
    .insert({ recipient_id: recipientId, ...input })
    .select('*')
    .single();
  return { data: data as ConsumableItem | null, error };
}

export async function recountConsumableItem(
  adminDb: SupabaseClient,
  itemId: string,
  currentQuantity: number,
): Promise<{ data: ConsumableItem | null; error: unknown }> {
  const { data, error } = await adminDb
    .from('consumable_items')
    .update({
      current_quantity: currentQuantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select('*')
    .single();
  return { data: data as ConsumableItem | null, error };
}
