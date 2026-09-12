import { SupabaseClient } from '@supabase/supabase-js';
import { MetricDefinitionRow } from './dynamicLog';
import { LogEntryLite } from './goals';
import {
  groceryShareDefinition,
  groceryShareEntries,
  InvoiceItemLite,
} from './groceryShare';

// Shared scoring inputs for the goal routes (/api/goals and /api/goals/series):
// the recipient's active metric definitions plus the log entries and grocery
// line items over a date window, with the virtual Supermercado share metric and
// its synthetic entries folded in. Extracted so the two routes load identically
// (they differ only in the window they ask for).

export interface GoalInputs {
  definitions: MetricDefinitionRow[];
  entries: LogEntryLite[];
  items: InvoiceItemLite[];
}

export async function loadGoalInputs(
  adminDb: SupabaseClient,
  recipientId: string,
  start: string,
  end: string,
): Promise<{ inputs: GoalInputs | null; error: unknown }> {
  const [defsRes, entriesRes, itemsRes] = await Promise.all([
    adminDb
      .from('metric_definitions')
      .select(
        'key, label, short_label, value_type, config, cadence, cadence_day, cadence_days, cadence_start, filled_by, required, sort_order, active',
      )
      .eq('recipient_id', recipientId)
      .eq('active', true),
    adminDb
      .from('care_log_entries')
      .select('log_date, values')
      .eq('recipient_id', recipientId)
      .gte('log_date', start)
      .lte('log_date', end),
    adminDb
      .from('invoice_items')
      .select(
        'purchase_date, amount_cents, discretionary, category, invoices!inner(doc_type)',
      )
      .eq('recipient_id', recipientId)
      .eq('invoices.doc_type', 'grocery')
      .gte('purchase_date', start)
      .lte('purchase_date', end),
  ]);

  const error = defsRes.error ?? entriesRes.error ?? itemsRes.error;
  if (error) return { inputs: null, error };

  const items = (itemsRes.data ?? []) as unknown as InvoiceItemLite[];
  return {
    inputs: {
      items,
      definitions: [
        ...((defsRes.data ?? []) as MetricDefinitionRow[]),
        groceryShareDefinition(),
      ],
      entries: [
        ...((entriesRes.data ?? []) as LogEntryLite[]),
        ...groceryShareEntries(items),
      ],
    },
    error: null,
  };
}
