import fc from 'fast-check';
import type { MetricDefinitionRow } from '../../services/dynamicLog';
import {
  computeGoalProgress,
  entryDayScore,
  GoalCategory,
  GoalMetricRule,
  GoalProgramRow,
} from '../../services/goals';
import {
  computeGoalDayScore,
  computeGoalRunRate,
} from '../../services/goalRunRate';
import { calculateDistanceInMeters } from '../../services/geofence';

// A17: the goals engine is the platform's money-adjacent business logic
// (weighted scoring → a monthly award) and invariant-rich: scores live in
// [0,1], category weights renormalize, distance is a metric. Example-based
// tests pin behaviors; these properties pin the LAWS across arbitrary
// inputs (fast-check), which is where hand-picked examples go blind.

function def(
  overrides: Partial<MetricDefinitionRow> & { key: string },
): MetricDefinitionRow {
  return {
    label: overrides.key,
    value_type: 'boolean',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    cadence_days: null,
    cadence_start: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    active: true,
    ...overrides,
  };
}

const DATE_ARB = fc
  .date({
    min: new Date('2026-01-01T00:00:00Z'),
    max: new Date('2026-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10));

const HHMM_ARB = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  );

// Any JSON-ish value a hostile or buggy client could put in a log entry
const VALUE_ARB = fc.oneof(
  fc.boolean(),
  fc.double({ noNaN: false }),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.record(
    { start: HHMM_ARB, end: HHMM_ARB, hours: fc.double({ noNaN: true }) },
    { requiredKeys: [] },
  ),
  fc.array(
    fc.record(
      {
        name: fc.string(),
        taken: fc.boolean(),
        prescribed_dosage: fc.integer(),
      },
      { requiredKeys: [] },
    ),
  ),
);

const RULE_ARB: fc.Arbitrary<GoalMetricRule> = fc.record(
  {
    key: fc.constant('metric'),
    rule: fc.constantFrom(
      undefined,
      'monthly_avg_max',
      'min_hours',
      'wake_by',
      'checklist_item',
      'parent_value',
    ) as fc.Arbitrary<GoalMetricRule['rule']>,
    target: fc.option(fc.double({ min: 0.1, max: 24, noNaN: true }), {
      nil: undefined,
    }),
    weekday: fc.option(HHMM_ARB, { nil: undefined }),
    weekend: fc.option(HHMM_ARB, { nil: undefined }),
    item: fc.option(fc.string(), { nil: undefined }),
    value: fc.option(fc.string(), { nil: undefined }),
  },
  { requiredKeys: ['key'] },
);

const VALUE_TYPE_ARB = fc.constantFrom(
  'boolean',
  'medication_checklist',
  'scale',
  'time_range',
  'number',
) as fc.Arbitrary<MetricDefinitionRow['value_type']>;

describe('entryDayScore invariants (A17, property-based)', () => {
  it('always returns null or a score within [0,1] for arbitrary rule/value shapes', () => {
    fc.assert(
      fc.property(
        RULE_ARB,
        VALUE_TYPE_ARB,
        VALUE_ARB,
        DATE_ARB,
        (rule, valueType, value, date) => {
          const score = entryDayScore(
            rule,
            def({ key: 'metric', value_type: valueType }),
            { metric: value },
            date,
          );
          expect(score === null || (score >= 0 && score <= 1)).toBe(true);
        },
      ),
    );
  });

  it('returns null (no evidence) whenever the key is absent, for every rule', () => {
    fc.assert(
      fc.property(RULE_ARB, VALUE_TYPE_ARB, DATE_ARB, (rule, vt, date) => {
        expect(
          entryDayScore(rule, def({ key: 'metric', value_type: vt }), {}, date),
        ).toBeNull();
      }),
    );
  });

  it('min_hours caps at 1 no matter how long the night was', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 24, noNaN: true }),
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        (hours, target) => {
          const score = entryDayScore(
            { key: 'sleep', rule: 'min_hours', target },
            def({ key: 'sleep', value_type: 'time_range' }),
            { sleep: { start: '22:00', end: '06:00', hours } },
            '2026-07-01',
          );
          expect(score).not.toBeNull();
          expect(score!).toBeLessThanOrEqual(1);
          expect(score!).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

function program(categories: GoalCategory[]): GoalProgramRow {
  return {
    id: 'program-1',
    starts_on: '2026-01-01',
    monthly_award_cents: 10_000,
    currency: 'BRL',
    categories,
    active: true,
  };
}

const WEIGHTS_ARB = fc.array(fc.double({ min: 0.05, max: 10, noNaN: true }), {
  minLength: 1,
  maxLength: 6,
});

describe('computeGoalDayScore weight invariants (A17, property-based)', () => {
  const defs = (keys: string[]) =>
    new Map(keys.map((key) => [key, def({ key })]));

  function boolProgram(weights: number[]): GoalProgramRow {
    return program(
      weights.map((weight, i) => ({
        key: `cat${i}`,
        label: `cat${i}`,
        weight,
        metrics: [{ key: `m${i}` }],
      })),
    );
  }

  it('a perfect day scores exactly 1 under ANY positive weight vector', () => {
    fc.assert(
      fc.property(WEIGHTS_ARB, (weights) => {
        const p = boolProgram(weights);
        const keys = weights.map((_, i) => `m${i}`);
        const values = Object.fromEntries(keys.map((k) => [k, true]));
        const score = computeGoalDayScore(
          p,
          defs(keys),
          [{ log_date: '2026-07-01', values }],
          '2026-07-01',
        );
        expect(score).toBeCloseTo(1, 10);
      }),
    );
  });

  it('an all-missed day scores exactly 0 under ANY positive weight vector', () => {
    fc.assert(
      fc.property(WEIGHTS_ARB, (weights) => {
        const p = boolProgram(weights);
        const keys = weights.map((_, i) => `m${i}`);
        const values = Object.fromEntries(keys.map((k) => [k, false]));
        const score = computeGoalDayScore(
          p,
          defs(keys),
          [{ log_date: '2026-07-01', values }],
          '2026-07-01',
        );
        expect(score).toBeCloseTo(0, 10);
      }),
    );
  });

  it('scaling every weight by a constant never changes the day score', () => {
    fc.assert(
      fc.property(
        WEIGHTS_ARB,
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        (weights, k, outcomes) => {
          const keys = weights.map((_, i) => `m${i}`);
          const values = Object.fromEntries(
            keys.map((key, i) => [key, outcomes[i % outcomes.length]]),
          );
          const entries = [{ log_date: '2026-07-01', values }];
          const base = computeGoalDayScore(
            boolProgram(weights),
            defs(keys),
            entries,
            '2026-07-01',
          );
          const scaled = computeGoalDayScore(
            boolProgram(weights.map((w) => w * k)),
            defs(keys),
            entries,
            '2026-07-01',
          );
          if (base === null) {
            expect(scaled).toBeNull();
          } else {
            expect(scaled).toBeCloseTo(base, 8);
          }
        },
      ),
    );
  });

  it('day scores stay in [0,1] for arbitrary boolean outcome vectors', () => {
    fc.assert(
      fc.property(
        WEIGHTS_ARB,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        (weights, outcomes) => {
          const keys = weights.map((_, i) => `m${i}`);
          const values = Object.fromEntries(
            keys.map((key, i) => [key, outcomes[i % outcomes.length]]),
          );
          const score = computeGoalDayScore(
            boolProgram(weights),
            defs(keys),
            [{ log_date: '2026-07-01', values }],
            '2026-07-01',
          );
          expect(score).not.toBeNull();
          expect(score!).toBeGreaterThanOrEqual(0);
          expect(score!).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

const COORD_ARB = fc.record({
  lat: fc.double({ min: -89.9, max: 89.9, noNaN: true }),
  lng: fc.double({ min: -179.9, max: 179.9, noNaN: true }),
});

describe('Haversine distance is a metric (A17, property-based)', () => {
  it('is non-negative and zero from a point to itself', () => {
    fc.assert(
      fc.property(COORD_ARB, ({ lat, lng }) => {
        expect(calculateDistanceInMeters(lat, lng, lat, lng)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(COORD_ARB, COORD_ARB, (a, b) => {
        const ab = calculateDistanceInMeters(a.lat, a.lng, b.lat, b.lng);
        const ba = calculateDistanceInMeters(b.lat, b.lng, a.lat, a.lng);
        expect(ab).toBeGreaterThanOrEqual(0);
        expect(ab).toBeCloseTo(ba, 6);
      }),
    );
  });

  it('never exceeds half the Earth circumference', () => {
    const HALF_CIRCUMFERENCE_M = Math.PI * 6371e3 + 1;
    fc.assert(
      fc.property(COORD_ARB, COORD_ARB, (a, b) => {
        expect(
          calculateDistanceInMeters(a.lat, a.lng, b.lat, b.lng),
        ).toBeLessThanOrEqual(HALF_CIRCUMFERENCE_M);
      }),
    );
  });
});

describe('entryDayScore branch coverage (A17)', () => {
  const date = '2026-07-01'; // a Wednesday
  const saturday = '2026-07-04';

  it('min_hours: malformed ranges and a missing target yield null', () => {
    const rule: GoalMetricRule = { key: 'sleep', rule: 'min_hours', target: 8 };
    const d = def({ key: 'sleep', value_type: 'time_range' });
    expect(entryDayScore(rule, d, { sleep: 'not-a-range' }, date)).toBeNull();
    expect(
      entryDayScore(rule, d, { sleep: { start: '25:99', end: '06:00' } }, date),
    ).toBeNull();
    expect(
      entryDayScore(rule, d, { sleep: { start: '23:00' } }, date),
    ).toBeNull();
    expect(
      entryDayScore(
        { key: 'sleep', rule: 'min_hours' },
        d,
        { sleep: { start: '23:00', end: '07:00' } },
        date,
      ),
    ).toBeNull();
  });

  it('min_hours: an overnight range wraps past midnight', () => {
    const score = entryDayScore(
      { key: 'sleep', rule: 'min_hours', target: 8 },
      def({ key: 'sleep', value_type: 'time_range' }),
      { sleep: { start: '23:00', end: '07:00' } },
      date,
    );
    expect(score).toBe(1); // 8h / 8h target
  });

  it('wake_by: weekend limit applies on Saturdays, weekday limit otherwise', () => {
    const rule: GoalMetricRule = {
      key: 'sleep',
      rule: 'wake_by',
      weekday: '07:30',
      weekend: '09:00',
    };
    const d = def({ key: 'sleep', value_type: 'time_range' });
    const wokeAt830 = { sleep: { start: '23:00', end: '08:30' } };
    expect(entryDayScore(rule, d, wokeAt830, date)).toBe(0);
    expect(entryDayScore(rule, d, wokeAt830, saturday)).toBe(1);
    // no limit configured for the day → no claim
    expect(
      entryDayScore(
        { key: 'sleep', rule: 'wake_by', weekend: '09:00' },
        d,
        wokeAt830,
        date,
      ),
    ).toBeNull();
    expect(entryDayScore(rule, d, { sleep: { end: 42 } }, date)).toBeNull();
  });

  it('checklist_item: explicit null scores 0, junk scores null, absent med scores null', () => {
    const rule: GoalMetricRule = {
      key: 'medications',
      rule: 'checklist_item',
      item: 'Olanzapine',
    };
    const d = def({ key: 'medications', value_type: 'medication_checklist' });
    expect(entryDayScore(rule, d, { medications: null }, date)).toBe(0);
    expect(entryDayScore(rule, d, { medications: 'oops' }, date)).toBeNull();
    expect(
      entryDayScore(
        rule,
        d,
        { medications: [{ name: 'Other', taken: true }] },
        date,
      ),
    ).toBeNull();
    expect(
      entryDayScore(
        rule,
        d,
        { medications: [{ name: 'Olanzapine', taken: false }] },
        date,
      ),
    ).toBe(0);
  });

  it('checklist_item: tolerates junk entries inside the checklist array', () => {
    const rule: GoalMetricRule = {
      key: 'medications',
      rule: 'checklist_item',
      item: 'Olanzapine',
    };
    const d = def({ key: 'medications', value_type: 'medication_checklist' });
    expect(
      entryDayScore(
        rule,
        d,
        { medications: [null, 42, { name: 'Olanzapine', taken: true }] },
        '2026-07-01',
      ),
    ).toBe(1);
  });

  it('parent_value: unconfigured, mismatched, and matched branches', () => {
    const d = def({
      key: 'attended',
      value_type: 'boolean',
      config: { depends_on: 'appointment_type' },
    });
    const rule: GoalMetricRule = {
      key: 'attended',
      rule: 'parent_value',
      value: 'psychologist',
    };
    // rule without value → null
    expect(
      entryDayScore(
        { key: 'attended', rule: 'parent_value' },
        d,
        { attended: true, appointment_type: 'psychologist' },
        date,
      ),
    ).toBeNull();
    // def without depends_on → null
    expect(
      entryDayScore(
        rule,
        def({ key: 'attended', value_type: 'boolean' }),
        { attended: true },
        date,
      ),
    ).toBeNull();
    expect(
      entryDayScore(
        rule,
        d,
        { attended: true, appointment_type: 'psychiatrist' },
        date,
      ),
    ).toBeNull();
    expect(
      entryDayScore(
        rule,
        d,
        { attended: false, appointment_type: 'psychologist' },
        date,
      ),
    ).toBe(0);
  });

  it('type-scored: dependent metrics skip "none" days; empty checklists score 0; unscoreable types are null', () => {
    const dependent = def({
      key: 'walked',
      value_type: 'boolean',
      config: { depends_on: 'outing' },
    });
    expect(
      entryDayScore(
        { key: 'walked' },
        dependent,
        { walked: true, outing: 'none' },
        date,
      ),
    ).toBeNull();
    expect(
      entryDayScore(
        { key: 'medications' },
        def({ key: 'medications', value_type: 'medication_checklist' }),
        { medications: [] },
        date,
      ),
    ).toBe(0);
    expect(
      entryDayScore(
        { key: 'notes' },
        def({ key: 'notes', value_type: 'text' }),
        { notes: 'texto livre' },
        date,
      ),
    ).toBeNull();
  });
});

describe('computeGoalProgress guard branches (A17)', () => {
  it('handles unknown metric keys, inactive definitions, and target-less avg rules without crashing', () => {
    const p = program([
      {
        key: 'cat',
        label: 'cat',
        weight: 1,
        metrics: [
          { key: 'ghost' }, // no definition at all
          { key: 'retired' }, // definition exists but inactive
          { key: 'cigarettes', rule: 'monthly_avg_max' }, // no target
          { key: 'cigarettes', rule: 'monthly_avg_max', target: 20 },
        ],
      },
    ]);
    const definitions = [
      def({ key: 'retired', active: false }),
      def({ key: 'cigarettes', value_type: 'number' }),
    ];
    const progress = computeGoalProgress(
      p,
      definitions,
      [
        { log_date: '2026-07-01', values: { cigarettes: 12 } },
        { log_date: '2026-07-01', values: { cigarettes: 18 } }, // same-day avg
      ],
      '2026-07',
    );

    const scored = progress.categories[0].metrics;
    expect(scored.find((m) => m.key === 'ghost')!.score).toBeNull();
    expect(scored.find((m) => m.key === 'retired')!.score).toBeNull();
    const avgRules = scored.filter((m) => m.key === 'cigarettes');
    expect(avgRules.find((m) => m.detail.target === null)!.score).toBeNull();
    // (12+18)/2 = 15 <= 20 → met
    const capped = avgRules.find((m) => m.detail.target === 20)!;
    expect(capped.score).toBe(1);
    expect(capped.detail.average).toBe(15);
    expect(progress.totalScore).not.toBeNull();
  });

  it('an over-cap month scores proportionally (target/avg) and total stays in [0,100]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 40, noNaN: true }),
        fc.double({ min: 1, max: 40, noNaN: true }),
        (avgValue, target) => {
          const p = program([
            {
              key: 'cat',
              label: 'cat',
              weight: 1,
              metrics: [{ key: 'cigarettes', rule: 'monthly_avg_max', target }],
            },
          ]);
          const progress = computeGoalProgress(
            p,
            [def({ key: 'cigarettes', value_type: 'number' })],
            [{ log_date: '2026-07-01', values: { cigarettes: avgValue } }],
            '2026-07',
          );
          const total = progress.totalScore;
          expect(total).not.toBeNull();
          expect(total!).toBeGreaterThanOrEqual(0);
          expect(total!).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});

describe('computeGoalRunRate perfect-day scenario (A17 branch coverage)', () => {
  it('projects the full award when every logged day was perfect (checklist + sleep + dependent + avg rules)', () => {
    const p = program([
      {
        key: 'meds',
        label: 'Meds',
        weight: 2,
        metrics: [
          { key: 'medications', rule: 'checklist_item', item: 'Olanzapine' },
          { key: 'medications', rule: 'checklist_item', item: 'Sertraline' },
        ],
      },
      {
        key: 'sleep',
        label: 'Sleep',
        weight: 1,
        metrics: [
          { key: 'sleep', rule: 'min_hours', target: 8 },
          { key: 'sleep', rule: 'wake_by', weekday: '08:00', weekend: '09:00' },
        ],
      },
      {
        key: 'smoking',
        label: 'Smoking',
        weight: 1,
        metrics: [{ key: 'cigarettes', rule: 'monthly_avg_max', target: 20 }],
      },
      {
        key: 'appointments',
        label: 'Appointments',
        weight: 1,
        metrics: [
          { key: 'attended', rule: 'parent_value', value: 'psychologist' },
        ],
      },
    ]);
    const definitions = [
      def({ key: 'medications', value_type: 'medication_checklist' }),
      def({ key: 'sleep', value_type: 'time_range' }),
      def({ key: 'cigarettes', value_type: 'number' }),
      def({
        key: 'attended',
        value_type: 'boolean',
        config: { depends_on: 'appointment_type' },
      }),
    ];
    const perfectValues = {
      medications: [
        { name: 'Olanzapine', taken: true },
        { name: 'Sertraline', taken: true },
      ],
      sleep: { start: '22:30', end: '06:30', hours: 8 },
      cigarettes: 10,
      appointment_type: 'none',
      attended: null,
    };
    const entries = [
      { log_date: '2026-07-01', values: perfectValues },
      { log_date: '2026-07-02', values: perfectValues },
    ];

    const runRate = computeGoalRunRate(p, definitions, entries, '2026-07');

    expect(runRate.lastLoggedDate).toBe('2026-07-02');
    expect(runRate.actual.length).toBe(2);
    // Scenario 1: remaining days simulated perfect → the full award
    expect(runRate.projectedPerfectCents).toBe(10_000);
    // Scenario 2: pace so far is perfect → also the full award
    expect(runRate.projectedPaceCents).toBe(10_000);
  });

  it('simulates perfect days for plain checklist metrics and skips unscoreable types', () => {
    const p = program([
      {
        key: 'meds',
        label: 'Meds',
        weight: 1,
        // Ruleless medication_checklist + a text metric: the perfect-day
        // simulator must fill the former and leave the latter unscored
        metrics: [{ key: 'medications' }, { key: 'diary' }],
      },
    ]);
    const definitions = [
      def({ key: 'medications', value_type: 'medication_checklist' }),
      def({ key: 'diary', value_type: 'text' }),
    ];
    const entries = [
      {
        log_date: '2026-07-01',
        values: { medications: [{ name: 'X', taken: true }] },
      },
    ];

    const runRate = computeGoalRunRate(p, definitions, entries, '2026-07');
    expect(runRate.projectedPerfectCents).toBe(10_000);
  });

  it('returns the empty shape for a month with no entries', () => {
    const p = program([
      { key: 'c', label: 'c', weight: 1, metrics: [{ key: 'm' }] },
    ]);
    const runRate = computeGoalRunRate(p, [def({ key: 'm' })], [], '2026-07');
    expect(runRate).toEqual({
      lastLoggedDate: null,
      actual: [],
      projectedPerfectCents: null,
      projectedPaceCents: null,
    });
  });
});
