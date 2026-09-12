import { MetricDefinitionRow } from './dynamicLog';
import { LogEntryLite } from './goals';

// ---------------------------------------------------------------------------
// Supermercado (M7): the discretionary share of grocery spend comes from
// classified invoice line items (invoice_items) — populated by whichever
// processor reads the uploaded receipts — not from a form metric. The
// route converts those rows into synthetic log entries under a
// virtual metric key, so the engine scores them with the ordinary
// monthly_avg_max rule — every shopping trip contributes its own share and
// the month averages them.

export const GROCERY_SHARE_KEY = 'grocery_discretionary_share';

export interface InvoiceItemLite {
  purchase_date: string;
  amount_cents: number;
  discretionary: boolean;
  // Free-text pt-BR category from the classifier (e.g. 'doces')
  category: string;
}

/** The virtual metric definition backing GROCERY_SHARE_KEY. */
export function groceryShareDefinition(): MetricDefinitionRow {
  return {
    key: GROCERY_SHARE_KEY,
    label: 'Supermercado',
    short_label: 'Supermercado',
    value_type: 'number',
    config: { min: 0, max: 100 },
    cadence: 'daily', // shopping can happen any day; evidence-gated anyway
    cadence_day: null,
    cadence_days: null,
    cadence_start: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    active: true,
  };
}

/**
 * One synthetic entry per shopping day: the percentage of that day's grocery
 * spend classified as discretionary. Days whose items net to zero or less
 * (all-discount edge case) are skipped — no meaningful share to score.
 */
export function groceryShareEntries(items: InvoiceItemLite[]): LogEntryLite[] {
  const byDate = new Map<string, { total: number; discretionary: number }>();
  for (const item of items) {
    const sums = byDate.get(item.purchase_date) ?? {
      total: 0,
      discretionary: 0,
    };
    sums.total += item.amount_cents;
    if (item.discretionary) sums.discretionary += item.amount_cents;
    byDate.set(item.purchase_date, sums);
  }
  const entries: LogEntryLite[] = [];
  for (const [date, sums] of byDate) {
    if (sums.total <= 0) continue;
    entries.push({
      log_date: date,
      values: {
        [GROCERY_SHARE_KEY]: (100 * sums.discretionary) / sums.total,
      },
    });
  }
  return entries.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

/** Month totals behind the Supermercado goal, for the breakdown card. */
export interface GroceryBreakdown {
  totalCents: number;
  discretionaryCents: number;
  /** Discretionary share of the month's spend, 0–1 */
  share: number;
  /** Discretionary categories by spend, largest first */
  topCategories: { category: string; amountCents: number }[];
}

/**
 * Aggregates the month's classified grocery items: total spend, the
 * discretionary slice, and the discretionary categories ranked by spend.
 * Null when there is nothing meaningful to show (no items, or the month
 * nets to zero or less). Note this is the aggregate month share — the goal
 * score averages per-trip shares instead, so the two can differ.
 */
export function groceryBreakdown(
  items: InvoiceItemLite[],
  topN = 3,
): GroceryBreakdown | null {
  let totalCents = 0;
  let discretionaryCents = 0;
  const byCategory = new Map<string, number>();
  for (const item of items) {
    totalCents += item.amount_cents;
    if (!item.discretionary) continue;
    discretionaryCents += item.amount_cents;
    byCategory.set(
      item.category,
      (byCategory.get(item.category) ?? 0) + item.amount_cents,
    );
  }
  if (totalCents <= 0) return null;
  const topCategories = [...byCategory.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .filter((entry) => entry.amountCents > 0)
    .sort(
      (a, b) =>
        b.amountCents - a.amountCents || a.category.localeCompare(b.category),
    )
    .slice(0, topN);
  return {
    totalCents,
    discretionaryCents,
    share: discretionaryCents / totalCents,
    topCategories,
  };
}
