import type { MetricSeries } from '../../services/aggregates';
import {
  buildPsychometricTrends,
  buildScaleTrends,
  latestClassifications,
  type PsychometricResult,
} from '../../services/clinicianCharts';

const scaleSeries = (
  key: string,
  min: number,
  max: number,
  avgs: Array<number | null>,
): MetricSeries => ({
  key,
  label: key,
  value_type: 'scale',
  config: { min, max },
  sort_order: 0,
  points: avgs.map((avg, index) => ({
    bucket: `2026-0${index + 1}`,
    count: avg === null ? 0 : 1,
    avg,
    sum: null,
    pct: null,
    distribution: null,
  })),
});

describe('buildScaleTrends', () => {
  it('normalizes averages to the scale range as 0-100', () => {
    const trends = buildScaleTrends([scaleSeries('mood', 1, 10, [1, 5.5, 10])]);
    expect(trends).toHaveLength(1);
    expect(trends[0].points.map((p) => p.value)).toEqual([0, 50, 100]);
    expect(trends[0].points.map((p) => p.raw)).toEqual([1, 5.5, 10]);
    expect(trends[0].rangeNote).toBe('1–10');
  });

  it('keeps empty buckets as null points', () => {
    const trends = buildScaleTrends([scaleSeries('mood', 0, 10, [null, 5])]);
    expect(trends[0].points[0].value).toBeNull();
    expect(trends[0].points[1].value).toBe(50);
  });

  it('drops non-scale series and scales with no data in the window', () => {
    const boolean: MetricSeries = {
      ...scaleSeries('slept', 0, 1, [1]),
      value_type: 'boolean',
    };
    const empty = scaleSeries('phq9', 0, 27, [null, null]);
    expect(buildScaleTrends([boolean, empty])).toHaveLength(0);
  });
});

const result = (
  overrides: Partial<PsychometricResult>,
): PsychometricResult => ({
  testDate: '2025-09-24',
  instrument: 'CTA',
  measure: 'Atenção Geral',
  rawScore: 60,
  percentile: 10,
  classification: 'Inferior',
  ...overrides,
});

describe('buildPsychometricTrends', () => {
  it('aligns each measure on the shared sorted year axis', () => {
    const { years, series } = buildPsychometricTrends([
      result({ testDate: '2026-09-20', percentile: 25 }),
      result({}),
      result({ instrument: 'WASI', measure: 'QI Total-4', percentile: 9 }),
    ]);
    expect(years).toEqual(['2025', '2026']);
    const cta = series.find((s) => s.key === 'CTA · Atenção Geral')!;
    expect(cta.points.map((p) => p.value)).toEqual([10, 25]);
    const wasi = series.find((s) => s.key === 'WASI · QI Total-4')!;
    // No 2026 evaluation for this measure → gap, not zero
    expect(wasi.points.map((p) => p.value)).toEqual([9, null]);
    expect(wasi.group).toBe('WASI');
  });

  it('excludes percentile-less scores from charting entirely', () => {
    const { years, series } = buildPsychometricTrends([
      result({ measure: 'Vocabulário (escore T)', percentile: null }),
    ]);
    expect(years).toEqual([]);
    expect(series).toEqual([]);
  });
});

describe('latestClassifications', () => {
  it('keeps the most recent year per measure', () => {
    const latest = latestClassifications([
      result({ classification: 'Inferior' }),
      result({
        testDate: '2026-09-20',
        percentile: 25,
        classification: 'Médio inferior',
      }),
    ]);
    expect(latest.get('CTA · Atenção Geral')).toEqual({
      percentile: 25,
      classification: 'Médio inferior',
    });
  });
});
