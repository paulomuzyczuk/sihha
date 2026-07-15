// Pure chart preparation for the clinician "Indicadores" dashboard: turns
// monthly aggregate series and yearly psychometric rows into plot-ready
// 0–100 line series. Free of I/O and React so the shaping is unit-testable.

import type { MetricSeries } from './aggregates';

export interface PsychometricResult {
  testDate: string;
  instrument: string;
  measure: string;
  rawScore: number | null;
  percentile: number | null;
  classification: string | null;
}

export interface TrendPoint {
  bucket: string; // '2026-07' (scales) or '2025' (psychometrics)
  value: number | null; // 0–100 plot value: normalized % or percentile
  raw: number | null; // instrument-native value, for the balloon
}

export interface TrendSeries {
  key: string;
  label: string;
  // Instrument for psychometric series (chip toggles); scale range note
  // ("1–10") for scale series.
  group?: string;
  rangeNote?: string;
  points: TrendPoint[];
}

/**
 * One line per scale metric, monthly averages normalized to the scale's own
 * [min, max] range so different instruments share the 0–100% axis. Series
 * with no data in the window are dropped rather than plotted flat.
 */
export function buildScaleTrends(series: MetricSeries[]): TrendSeries[] {
  return series
    .filter((s) => s.value_type === 'scale')
    .map((s) => {
      const min = s.config.min ?? 0;
      const max = s.config.max ?? 10;
      const span = max - min || 1;
      return {
        key: s.key,
        label: s.label,
        rangeNote: `${min}–${max}`,
        points: s.points.map((point) => ({
          bucket: point.bucket,
          value: point.avg === null ? null : ((point.avg - min) / span) * 100,
          raw: point.avg,
        })),
      };
    })
    .filter((s) => s.points.some((point) => point.value !== null));
}

/**
 * One line per psychometric measure carrying a percentile, aligned on the
 * shared list of evaluation years (one data point per year). Measures without
 * percentiles (e.g. WASI subtest T scores) don't chart — the percentile is
 * the only unit comparable across instruments and years.
 */
export function buildPsychometricTrends(results: PsychometricResult[]): {
  years: string[];
  series: TrendSeries[];
} {
  const charted = results.filter((row) => row.percentile !== null);
  const years = [
    ...new Set(charted.map((row) => row.testDate.slice(0, 4))),
  ].sort();

  const byMeasure = new Map<string, PsychometricResult[]>();
  for (const row of charted) {
    const key = `${row.instrument} · ${row.measure}`;
    const bucket = byMeasure.get(key);
    if (bucket) bucket.push(row);
    else byMeasure.set(key, [row]);
  }

  const series = [...byMeasure.entries()].map(([key, rows]) => ({
    key,
    label: rows[0].measure,
    group: rows[0].instrument,
    points: years.map((year) => {
      const match = rows.find((row) => row.testDate.startsWith(year));
      return {
        bucket: year,
        value: match?.percentile ?? null,
        raw: match?.rawScore ?? null,
      };
    }),
  }));

  return { years, series };
}

/** The most recent year's classification per charted measure, for the legend. */
export function latestClassifications(
  results: PsychometricResult[],
): Map<string, { percentile: number; classification: string | null }> {
  const latest = new Map<
    string,
    { testDate: string; percentile: number; classification: string | null }
  >();
  for (const row of results) {
    if (row.percentile === null) continue;
    const key = `${row.instrument} · ${row.measure}`;
    const current = latest.get(key);
    if (!current || row.testDate > current.testDate) {
      latest.set(key, {
        testDate: row.testDate,
        percentile: row.percentile,
        classification: row.classification,
      });
    }
  }
  return new Map(
    [...latest.entries()].map(([key, value]) => [
      key,
      { percentile: value.percentile, classification: value.classification },
    ]),
  );
}
