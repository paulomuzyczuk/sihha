// Pure aggregation of care_log_entries into per-metric period series for the
// dashboard. Generic since M4: instead of hardcoding flagship metric names,
// aggregation dispatches on each metric definition's value_type (design
// §3.3/§4), so any recipient's metric set aggregates without code changes.
// Kept free of I/O so the bucketing and arithmetic are unit-testable without
// a database.

import type { MetricDefinitionRow } from './dynamicLog';

export type AggregationPeriod = 'daily' | 'weekly' | 'monthly';

export const AGGREGATION_PERIODS: readonly AggregationPeriod[] = [
  'daily',
  'weekly',
  'monthly',
] as const;

// The lookback window is user-defined as "last N periods". Days-per-period
// uses 31 for months so the window never undershoots a long month; the first
// bucket may be partial either way, which the dashboard tolerates. One
// caregiver log per day means even the max windows stay tiny (≤ ~366 rows),
// so aggregation in JS is trivially cheap.
export const PERIOD_UNIT_DAYS: Record<AggregationPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
} as const;

export const DEFAULT_LOOKBACK: Record<AggregationPeriod, number> = {
  daily: 14,
  weekly: 8,
  monthly: 6,
} as const;

export const MAX_LOOKBACK: Record<AggregationPeriod, number> = {
  daily: 366,
  weekly: 52,
  monthly: 12,
} as const;

export function lookbackWindowDays(
  period: AggregationPeriod,
  lookback: number,
): number {
  return PERIOD_UNIT_DAYS[period] * lookback;
}

/**
 * ISO-8601 week key (e.g. '2026-W27'). Weeks start on Monday and belong to
 * the year containing their Thursday, so early-January days can key to the
 * previous ISO year — the standard boundary behaviour clinicians expect from
 * week numbering.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayOfWeek = d.getUTCDay() || 7; // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // move to the week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function bucketKey(
  createdAt: string,
  period: AggregationPeriod,
): string {
  const date = new Date(createdAt);
  const isoDay = date.toISOString().slice(0, 10);
  if (period === 'daily') return isoDay;
  if (period === 'monthly') return isoDay.slice(0, 7);
  return isoWeekKey(date);
}

export type MetricValueType = MetricDefinitionRow['value_type'];

export interface MetricSeriesConfig {
  min?: number;
  max?: number;
  unit?: string;
  options?: Array<number | { value: string; label: string }>;
  depends_on?: string;
}

/** The definition subset aggregation (and the dashboard) needs per metric. */
export interface AggregateMetricDefinition {
  key: string;
  label: string;
  value_type: MetricValueType;
  config: MetricSeriesConfig;
  sort_order: number;
}

export interface CareLogEntryValuesRow {
  created_at: string;
  values: Record<string, unknown>;
}

// One bucket of one metric's series. Which fields are populated depends on
// the metric's value_type (null otherwise):
//   scale, number    → count = non-null values,  avg (+ sum for number)
//   boolean          → count = non-null values,  sum = true count, pct
//   duration_minutes → count = sessions,         sum = total minutes
//   time_range       → count = non-null values,  avg = hours
//   enum             → count = non-null values,  distribution {value: n}
//   medication_checklist → count = items, sum = taken items, pct = adherence
export interface MetricSeriesPoint {
  bucket: string;
  count: number;
  avg: number | null;
  sum: number | null;
  pct: number | null;
  distribution: Record<string, number> | null;
}

export interface MetricSeries extends AggregateMetricDefinition {
  points: MetricSeriesPoint[];
}

export interface MetricAggregateResult {
  buckets: Array<{ key: string; logCount: number }>;
  series: MetricSeries[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratioPct(hit: number, total: number): number | null {
  return total === 0 ? null : round1((hit / total) * 100);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Values arrive from JSONB, so every extractor type-checks before counting:
// a malformed value is treated as absent rather than corrupting the series.
function aggregatePoint(
  def: AggregateMetricDefinition,
  group: CareLogEntryValuesRow[],
  bucket: string,
): MetricSeriesPoint {
  const point: MetricSeriesPoint = {
    bucket,
    count: 0,
    avg: null,
    sum: null,
    pct: null,
    distribution: null,
  };
  const raw = group
    .map((entry) => entry.values[def.key])
    .filter((value) => value != null);

  switch (def.value_type) {
    case 'scale':
    case 'number': {
      const nums = raw.filter(isFiniteNumber);
      point.count = nums.length;
      if (nums.length > 0) {
        const total = nums.reduce((acc, n) => acc + n, 0);
        point.sum = round1(total);
        point.avg = round1(total / nums.length);
      }
      break;
    }
    case 'duration_minutes': {
      const nums = raw.filter(isFiniteNumber);
      point.count = nums.length;
      if (nums.length > 0) {
        point.sum = round1(nums.reduce((acc, n) => acc + n, 0));
      }
      break;
    }
    case 'boolean': {
      const bools = raw.filter(
        (value): value is boolean => typeof value === 'boolean',
      );
      point.count = bools.length;
      if (bools.length > 0) {
        const done = bools.filter(Boolean).length;
        point.sum = done;
        point.pct = ratioPct(done, bools.length);
      }
      break;
    }
    case 'time_range': {
      const hours = raw
        .map((value) => (value as { hours?: unknown }).hours)
        .filter(isFiniteNumber);
      point.count = hours.length;
      if (hours.length > 0) {
        point.avg = round1(hours.reduce((acc, h) => acc + h, 0) / hours.length);
      }
      break;
    }
    case 'enum': {
      const chosen = raw.filter(
        (value): value is string => typeof value === 'string',
      );
      point.count = chosen.length;
      if (chosen.length > 0) {
        const distribution: Record<string, number> = {};
        for (const value of chosen) {
          distribution[value] = (distribution[value] ?? 0) + 1;
        }
        point.distribution = distribution;
      }
      break;
    }
    case 'medication_checklist': {
      let taken = 0;
      let total = 0;
      for (const value of raw) {
        if (!Array.isArray(value)) continue;
        for (const item of value) {
          total += 1;
          if ((item as { taken?: boolean })?.taken === true) taken += 1;
        }
      }
      // Adherence is computed over items, not logs, so a day with 3 of 4
      // medications taken contributes 3/4 — matching clinical reasoning.
      point.count = total;
      if (total > 0) {
        point.sum = taken;
        point.pct = ratioPct(taken, total);
      }
      break;
    }
  }
  return point;
}

/**
 * Groups entries into period buckets (ascending by key) and computes one
 * series per metric definition, ordered by sort_order. Every series carries
 * one point per bucket (count 0 when the metric was null throughout), so
 * consumers can zip series against `buckets` positionally.
 */
export function aggregateMetricSeries(
  definitions: AggregateMetricDefinition[],
  entries: CareLogEntryValuesRow[],
  period: AggregationPeriod,
): MetricAggregateResult {
  const groups = new Map<string, CareLogEntryValuesRow[]>();
  for (const entry of entries) {
    const key = bucketKey(entry.created_at, period);
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const orderedKeys = Array.from(groups.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  const buckets = orderedKeys.map((key) => ({
    key,
    logCount: groups.get(key)!.length,
  }));

  const series = [...definitions]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((def) => ({
      ...def,
      points: orderedKeys.map((key) =>
        aggregatePoint(def, groups.get(key)!, key),
      ),
    }));

  return { buckets, series };
}
