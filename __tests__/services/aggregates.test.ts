import {
  aggregateMetricSeries,
  bucketKey,
  isoWeekKey,
  AggregateMetricDefinition,
  CareLogEntryValuesRow,
} from '../../services/aggregates';

function def(
  key: string,
  value_type: AggregateMetricDefinition['value_type'],
  overrides: Partial<AggregateMetricDefinition> = {},
): AggregateMetricDefinition {
  return {
    key,
    label: key,
    value_type,
    config: {},
    sort_order: 0,
    ...overrides,
  };
}

function entry(
  createdAt: string,
  values: Record<string, unknown>,
): CareLogEntryValuesRow {
  return { created_at: createdAt, values };
}

function seriesFor(
  definitions: AggregateMetricDefinition[],
  entries: CareLogEntryValuesRow[],
  key: string,
) {
  const result = aggregateMetricSeries(definitions, entries, 'daily');
  return result.series.find((s) => s.key === key)!;
}

describe('bucketKey', () => {
  it('keys daily buckets by ISO date', () => {
    expect(bucketKey('2026-07-04T18:30:00.000Z', 'daily')).toBe('2026-07-04');
  });

  it('keys monthly buckets by year-month', () => {
    expect(bucketKey('2026-07-04T18:30:00.000Z', 'monthly')).toBe('2026-07');
  });

  it('keys weekly buckets by ISO week', () => {
    // 2026-07-04 is a Saturday in ISO week 27 of 2026
    expect(bucketKey('2026-07-04T18:30:00.000Z', 'weekly')).toBe('2026-W27');
  });
});

describe('isoWeekKey', () => {
  it('assigns Monday and Sunday of the same ISO week to one key', () => {
    expect(isoWeekKey(new Date('2026-06-29T00:00:00Z'))).toBe('2026-W27'); // Monday
    expect(isoWeekKey(new Date('2026-07-05T23:59:59Z'))).toBe('2026-W27'); // Sunday
  });

  it('assigns early January to the previous ISO year when applicable', () => {
    // 2027-01-01 is a Friday belonging to ISO week 53 of 2026
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('aggregateMetricSeries', () => {
  const DAY = '2026-07-01T10:00:00.000Z';

  it('returns empty buckets and empty series points for no entries', () => {
    const result = aggregateMetricSeries([def('mood', 'scale')], [], 'daily');
    expect(result.buckets).toEqual([]);
    expect(result.series).toHaveLength(1);
    expect(result.series[0].points).toEqual([]);
  });

  it('averages scale values within a bucket', () => {
    const series = seriesFor(
      [def('mood', 'scale')],
      [entry(DAY, { mood: 2 }), entry(DAY, { mood: 5 })],
      'mood',
    );
    expect(series.points).toEqual([
      {
        bucket: '2026-07-01',
        count: 2,
        avg: 3.5,
        sum: 7,
        pct: null,
        distribution: null,
      },
    ]);
  });

  it('averages and sums number values within a bucket', () => {
    const series = seriesFor(
      [def('weight', 'number')],
      [entry(DAY, { weight: 4.1 }), entry(DAY, { weight: 4.5 })],
      'weight',
    );
    expect(series.points[0].avg).toBe(4.3);
    expect(series.points[0].sum).toBe(8.6);
  });

  it('computes boolean completion over non-null values only', () => {
    const series = seriesFor(
      [def('took_trash', 'boolean')],
      [
        entry(DAY, { took_trash: true }),
        entry(DAY, { took_trash: false }),
        entry(DAY, { took_trash: null }), // weekly metric not due — excluded
        entry(DAY, { took_trash: true }),
      ],
      'took_trash',
    );
    expect(series.points[0].count).toBe(3);
    expect(series.points[0].sum).toBe(2);
    expect(series.points[0].pct).toBe(66.7);
  });

  it('sums duration_minutes and counts sessions', () => {
    const series = seriesFor(
      [def('exercise_minutes', 'duration_minutes')],
      [
        entry(DAY, { exercise_minutes: 30 }),
        entry(DAY, { exercise_minutes: 45 }),
        entry(DAY, { exercise_minutes: null }),
      ],
      'exercise_minutes',
    );
    expect(series.points[0].count).toBe(2);
    expect(series.points[0].sum).toBe(75);
  });

  it('averages time_range hours', () => {
    const series = seriesFor(
      [def('sleep', 'time_range')],
      [
        entry(DAY, { sleep: { start: '22:00', end: '06:00', hours: 8 } }),
        entry(DAY, { sleep: { start: '23:00', end: '06:00', hours: 7 } }),
      ],
      'sleep',
    );
    expect(series.points[0].count).toBe(2);
    expect(series.points[0].avg).toBe(7.5);
  });

  it('builds enum value distributions', () => {
    const series = seriesFor(
      [def('exercise_type', 'enum')],
      [
        entry(DAY, { exercise_type: 'walking' }),
        entry(DAY, { exercise_type: 'walking' }),
        entry(DAY, { exercise_type: 'gym_session' }),
        entry(DAY, { exercise_type: null }),
      ],
      'exercise_type',
    );
    expect(series.points[0].count).toBe(3);
    expect(series.points[0].distribution).toEqual({
      walking: 2,
      gym_session: 1,
    });
  });

  it('computes medication adherence over checklist items, not logs', () => {
    const series = seriesFor(
      [def('medications', 'medication_checklist')],
      [
        entry(DAY, {
          medications: [
            { taken: true },
            { taken: true },
            { taken: false },
            { taken: false },
          ],
        }),
        entry(DAY, { medications: [{ taken: true }] }),
      ],
      'medications',
    );
    expect(series.points[0].count).toBe(5);
    expect(series.points[0].sum).toBe(3);
    expect(series.points[0].pct).toBe(60);
  });

  it('emits a zero-count point when a metric is null throughout a bucket', () => {
    const series = seriesFor(
      [def('medications', 'medication_checklist')],
      [entry(DAY, { medications: [] }), entry(DAY, {})],
      'medications',
    );
    expect(series.points[0]).toEqual({
      bucket: '2026-07-01',
      count: 0,
      avg: null,
      sum: null,
      pct: null,
      distribution: null,
    });
  });

  it('skips malformed values instead of corrupting the series', () => {
    const series = seriesFor(
      [def('mood', 'scale')],
      [entry(DAY, { mood: 'terrible' }), entry(DAY, { mood: 4 })],
      'mood',
    );
    expect(series.points[0].count).toBe(1);
    expect(series.points[0].avg).toBe(4);
  });

  it('orders series by sort_order and points by ascending bucket', () => {
    const result = aggregateMetricSeries(
      [
        def('second', 'boolean', { sort_order: 2 }),
        def('first', 'scale', { sort_order: 1 }),
      ],
      [
        entry('2026-07-03T08:00:00.000Z', { first: 4, second: true }),
        entry('2026-07-01T08:00:00.000Z', { first: 2, second: false }),
      ],
      'daily',
    );
    expect(result.series.map((s) => s.key)).toEqual(['first', 'second']);
    expect(result.buckets).toEqual([
      { key: '2026-07-01', logCount: 1 },
      { key: '2026-07-03', logCount: 1 },
    ]);
    expect(result.series[0].points.map((p) => p.bucket)).toEqual([
      '2026-07-01',
      '2026-07-03',
    ]);
  });

  it('aligns every series positionally with the bucket list', () => {
    const result = aggregateMetricSeries(
      [def('mood', 'scale'), def('fed', 'boolean')],
      [
        entry('2026-07-01T08:00:00.000Z', { mood: 2, fed: true }),
        entry('2026-07-03T08:00:00.000Z', { mood: 4 }), // fed absent that day
      ],
      'daily',
    );
    for (const series of result.series) {
      expect(series.points.map((p) => p.bucket)).toEqual(
        result.buckets.map((b) => b.key),
      );
    }
    const fed = result.series.find((s) => s.key === 'fed')!;
    expect(fed.points[1].count).toBe(0);
  });

  it('groups a fortnight of entries into two weekly buckets', () => {
    const days = [
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-06',
      '2026-07-07',
    ];
    const result = aggregateMetricSeries(
      [def('mood', 'scale')],
      days.map((day) => entry(`${day}T10:00:00.000Z`, { mood: 3 })),
      'weekly',
    );
    expect(result.buckets).toEqual([
      { key: '2026-W27', logCount: 3 },
      { key: '2026-W28', logCount: 2 },
    ]);
  });

  it('groups entries into monthly buckets', () => {
    const result = aggregateMetricSeries(
      [def('mood', 'scale')],
      [
        entry('2026-06-15T10:00:00.000Z', { mood: 1 }),
        entry('2026-07-01T10:00:00.000Z', { mood: 3 }),
        entry('2026-07-20T10:00:00.000Z', { mood: 5 }),
      ],
      'monthly',
    );
    expect(result.buckets.map((b) => b.key)).toEqual(['2026-06', '2026-07']);
    expect(result.series[0].points[1].avg).toBe(4);
  });
});
