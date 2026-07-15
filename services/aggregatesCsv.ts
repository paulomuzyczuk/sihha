// Pure serialization of the aggregate result (services/aggregates.ts) into
// CSV for the clinician export. Mirrors the dashboard's per-value_type
// dispatch but emits machine-friendly numbers (no display formatting), so the
// file imports cleanly into spreadsheets and stats tools. Kept free of I/O so
// escaping and column layout are unit-testable.

import type {
  MetricAggregateResult,
  MetricSeries,
  MetricSeriesPoint,
} from './aggregates';
import { displayDate } from './dateUtils';

/**
 * The period column in the app-wide display standard: daily buckets become
 * dd/mm/yyyy, monthly mm/yyyy; ISO weeks (2026-W28) have no day/month
 * rendering and stay as-is.
 */
function bucketLabel(key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return displayDate(key);
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split('-');
    return `${month}/${year}`;
  }
  return key;
}

/**
 * Escapes one CSV cell (RFC 4180 quoting) and neutralises spreadsheet formula
 * injection: metric labels and enum values are user-defined, and a cell
 * starting with = + - @ or a tab would execute as a formula when the export
 * is opened in Excel/LibreOffice, so those cells get a leading apostrophe.
 *   Ref: OWASP, CSV Injection.
 */
export function csvCell(raw: string | number | null): string {
  if (raw === null) return '';
  let value = String(raw);
  if (/^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value))) {
    value = `'${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Column headers a series contributes, suffixed by what the number means. */
function seriesColumns(series: MetricSeries): string[] {
  switch (series.value_type) {
    case 'scale':
    case 'number':
    case 'time_range':
      return [`${series.label} (avg)`];
    case 'boolean':
    case 'medication_checklist':
      return [`${series.label} (%)`];
    case 'duration_minutes':
      return [`${series.label} (count)`, `${series.label} (min)`];
    case 'enum':
      return [series.label];
  }
}

// value:count pairs sorted by frequency — raw stored values, not display
// labels, so the export is stable across label edits and translations.
function distributionCell(point: MetricSeriesPoint): string {
  return Object.entries(point.distribution ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([value, n]) => `${value}:${n}`)
    .join('; ');
}

function seriesValues(
  series: MetricSeries,
  point: MetricSeriesPoint,
): Array<string | number | null> {
  if (point.count === 0) {
    return series.value_type === 'duration_minutes' ? [null, null] : [null];
  }
  switch (series.value_type) {
    case 'scale':
    case 'number':
    case 'time_range':
      return [point.avg];
    case 'boolean':
    case 'medication_checklist':
      return [point.pct];
    case 'duration_minutes':
      return [point.count, point.sum];
    case 'enum':
      return [distributionCell(point)];
  }
}

/**
 * One row per bucket (ascending, same order as the aggregate result), one or
 * two columns per metric series. The first columns are the bucket in the
 * display standard (01/07/2026 / 2026-W27 / 07/2026) and the number of logs
 * in the bucket.
 */
export function aggregatesToCsv(result: MetricAggregateResult): string {
  const { buckets, series } = result;

  const header = ['period', 'logs', ...series.flatMap((s) => seriesColumns(s))];

  const rows = buckets.map((bucket, index) => [
    bucketLabel(bucket.key),
    bucket.logCount,
    ...series.flatMap((s) => seriesValues(s, s.points[index])),
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}
