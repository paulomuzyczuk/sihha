import type { MetricDefinitionRow } from '../../services/dynamicLog';
import {
  computeGoalProgress,
  computeGoalRunRate,
  entryDayScore,
  groceryBreakdown,
  groceryShareDefinition,
  groceryShareEntries,
  GoalProgramRow,
  GROCERY_SHARE_KEY,
  InvoiceItemLite,
} from '../../services/goals';

// Classified invoice line item; category defaults to a neutral essential
const item = (
  purchase_date: string,
  amount_cents: number,
  discretionary: boolean,
  category = 'mercearia',
): InvoiceItemLite => ({
  purchase_date,
  amount_cents,
  discretionary,
  category,
});

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

const DEFS: MetricDefinitionRow[] = [
  def({ key: 'breakfast' }),
  def({ key: 'smoked_outside_building' }),
  def({
    key: 'cigarettes_count',
    value_type: 'scale',
    config: { min: 1, max: 40 },
  }),
  def({ key: 'medications', value_type: 'medication_checklist' }),
  def({ key: 'made_bed' }),
  // Monday-only weekly chore (2026-08-03 is a Monday)
  def({ key: 'did_laundry', cadence: 'weekly', cadence_day: 0 }),
  def({
    key: 'appointment_type',
    value_type: 'enum',
    config: { options: [{ value: 'psychologist', label: 'Psicólogo(a)' }] },
  }),
  def({
    key: 'appointment_attended',
    config: { depends_on: 'appointment_type' },
  }),
  def({ key: 'sleep', value_type: 'time_range' }),
];

const SLEEP_DEF = DEFS.find((d) => d.key === 'sleep')!;
const ATTENDED_DEF = DEFS.find((d) => d.key === 'appointment_attended')!;
const MEDS_DEF = DEFS.find((d) => d.key === 'medications')!;

function program(categories: GoalProgramRow['categories']): GoalProgramRow {
  return {
    id: 'program-1',
    starts_on: '2026-08-01',
    monthly_award_cents: 50000,
    currency: 'BRL',
    active: true,
    categories,
  };
}

describe('entryDayScore', () => {
  it('medication checklists score the fraction of items taken', () => {
    const values = {
      medications: [
        { name: 'A', prescribed_dosage: 1, taken: true },
        { name: 'B', prescribed_dosage: 2, taken: false },
      ],
    };
    expect(
      entryDayScore({ key: 'medications' }, MEDS_DEF, values, '2026-08-03'),
    ).toBe(0.5);
  });

  it('dependent metrics are skipped without a parent, scored with one', () => {
    const rule = { key: 'appointment_attended' };
    expect(
      entryDayScore(
        rule,
        ATTENDED_DEF,
        { appointment_type: null },
        '2026-08-03',
      ),
    ).toBeNull();
    // Explicit "none" (nothing scheduled) also keeps the day out of scoring
    expect(
      entryDayScore(
        rule,
        ATTENDED_DEF,
        { appointment_type: 'none', appointment_attended: null },
        '2026-08-03',
      ),
    ).toBeNull();
    expect(
      entryDayScore(
        rule,
        ATTENDED_DEF,
        { appointment_type: 'psychologist', appointment_attended: true },
        '2026-08-03',
      ),
    ).toBe(1);
    expect(
      entryDayScore(
        rule,
        ATTENDED_DEF,
        { appointment_type: 'psychologist', appointment_attended: null },
        '2026-08-03',
      ),
    ).toBe(0);
  });

  it('checklist_item scores one medication individually', () => {
    const values = {
      medications: [
        { name: 'Quetiapina', prescribed_dosage: 3, taken: true },
        { name: 'Risperidona', prescribed_dosage: 2, taken: false },
      ],
    };
    const rule = (item: string) => ({
      key: 'medications',
      rule: 'checklist_item' as const,
      item,
    });
    expect(
      entryDayScore(rule('Quetiapina'), MEDS_DEF, values, '2026-08-03'),
    ).toBe(1);
    expect(
      entryDayScore(rule('Risperidona'), MEDS_DEF, values, '2026-08-03'),
    ).toBe(0);
    // A med absent from that day's checklist is no evidence either way
    expect(
      entryDayScore(rule('Valproato de Sódio'), MEDS_DEF, values, '2026-08-03'),
    ).toBeNull();
  });

  it('parent_value scores attendance per appointment type', () => {
    const rule = (value: string) => ({
      key: 'appointment_attended',
      rule: 'parent_value' as const,
      value,
    });
    const day = {
      appointment_type: 'psychologist',
      appointment_attended: true,
    };
    expect(
      entryDayScore(rule('psychologist'), ATTENDED_DEF, day, '2026-08-03'),
    ).toBe(1);
    // Another type's sub-goal skips the day entirely
    expect(
      entryDayScore(rule('psychiatrist'), ATTENDED_DEF, day, '2026-08-03'),
    ).toBeNull();
    expect(
      entryDayScore(
        rule('psychologist'),
        ATTENDED_DEF,
        { appointment_type: 'psychologist', appointment_attended: false },
        '2026-08-03',
      ),
    ).toBe(0);
  });

  it('min_hours is proportional and capped at 1', () => {
    const rule = { key: 'sleep', rule: 'min_hours' as const, target: 7 };
    const night = (start: string, end: string, hours: number) => ({
      sleep: { start, end, hours },
    });
    expect(
      entryDayScore(rule, SLEEP_DEF, night('23:00', '07:00', 8), '2026-08-03'),
    ).toBe(1);
    expect(
      entryDayScore(
        rule,
        SLEEP_DEF,
        night('01:30', '05:00', 3.5),
        '2026-08-03',
      ),
    ).toBe(0.5);
  });

  it('wake_by uses the weekday limit Mon-Fri and the weekend one Sat-Sun', () => {
    const rule = {
      key: 'sleep',
      rule: 'wake_by' as const,
      weekday: '08:30',
      weekend: '09:30',
    };
    const wake = (end: string) => ({ sleep: { start: '23:00', end } });
    // 2026-08-03 is a Monday, 2026-08-08 a Saturday
    expect(entryDayScore(rule, SLEEP_DEF, wake('08:30'), '2026-08-03')).toBe(1);
    expect(entryDayScore(rule, SLEEP_DEF, wake('08:45'), '2026-08-03')).toBe(0);
    expect(entryDayScore(rule, SLEEP_DEF, wake('09:15'), '2026-08-08')).toBe(1);
    expect(entryDayScore(rule, SLEEP_DEF, wake('09:45'), '2026-08-08')).toBe(0);
  });
});

describe('computeGoalProgress', () => {
  it('sub-goals weigh equally inside a category', () => {
    // Cigarettes: count avg 30 vs cap 20 → 20/30 ≈ 0.667; outside met on
    // 1 of 2 days → 0.5. Category = (0.667 + 0.5) / 2
    const entries = [
      {
        log_date: '2026-08-03',
        values: { cigarettes_count: 20, smoked_outside_building: true },
      },
      {
        log_date: '2026-08-04',
        values: { cigarettes_count: 40, smoked_outside_building: false },
      },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'cigarettes',
          label: 'Cigarros',
          weight: 1,
          metrics: [
            { key: 'cigarettes_count', rule: 'monthly_avg_max', target: 20 },
            { key: 'smoked_outside_building' },
          ],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    const [cigarettes] = progress.categories;
    expect(cigarettes.metrics[0].score).toBeCloseTo(20 / 30, 10);
    expect(cigarettes.metrics[1].score).toBe(0.5);
    expect(cigarettes.score).toBeCloseTo((20 / 30 + 0.5) / 2, 10);
  });

  it('cigarette cap is a monthly average, not a per-day pass/fail', () => {
    // 25 and 15 average to the cap exactly → full score despite one day over
    const entries = [
      { log_date: '2026-08-03', values: { cigarettes_count: 25 } },
      { log_date: '2026-08-04', values: { cigarettes_count: 15 } },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'cigarettes',
          label: 'Cigarros',
          weight: 1,
          metrics: [
            { key: 'cigarettes_count', rule: 'monthly_avg_max', target: 20 },
          ],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    expect(progress.categories[0].score).toBe(1);
    expect(progress.projectedAwardCents).toBe(50000);
  });

  it('appointments only count on days with an appointment scheduled', () => {
    const entries = [
      { log_date: '2026-08-03', values: { appointment_type: null } },
      {
        log_date: '2026-08-04',
        values: {
          appointment_type: 'psychologist',
          appointment_attended: true,
        },
      },
      {
        log_date: '2026-08-05',
        values: {
          appointment_type: 'psychologist',
          appointment_attended: false,
        },
      },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'appointments',
          label: 'Consultas',
          weight: 1,
          metrics: [{ key: 'appointment_attended' }],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    // Only the 4th and 5th count: 1 of 2 attended
    expect(progress.categories[0].score).toBe(0.5);
  });

  it('sleep combines proportional hours with the wake-up threshold', () => {
    const entries = [
      // Monday: 7h, woke 07:00 → hours 1, wake 1
      {
        log_date: '2026-08-03',
        values: { sleep: { start: '00:00', end: '07:00', hours: 7 } },
      },
      // Tuesday: 3.5h, woke 09:00 → hours 0.5, wake 0
      {
        log_date: '2026-08-04',
        values: { sleep: { start: '05:30', end: '09:00', hours: 3.5 } },
      },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'sleep',
          label: 'Sono',
          weight: 1,
          metrics: [
            { key: 'sleep', rule: 'min_hours', target: 7 },
            {
              key: 'sleep',
              rule: 'wake_by',
              weekday: '08:30',
              weekend: '09:30',
            },
          ],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    const [sleep] = progress.categories;
    expect(sleep.metrics[0].score).toBeCloseTo(0.75, 10); // (1 + 0.5) / 2
    expect(sleep.metrics[1].score).toBe(0.5); // (1 + 0) / 2
    expect(sleep.score).toBeCloseTo(0.625, 10);
  });

  it('weights the categories and renormalizes when one has no data', () => {
    const entries = [
      {
        log_date: '2026-08-04', // Tuesday: laundry not due → chores no data
        values: {
          breakfast: true,
          made_bed: false,
          medications: [{ name: 'A', prescribed_dosage: 1, taken: true }],
        },
      },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'nutrition',
          label: 'Nutrição',
          weight: 0.5,
          metrics: [{ key: 'breakfast' }],
        },
        {
          key: 'medication',
          label: 'Medicações',
          weight: 0.3,
          metrics: [{ key: 'medications' }],
        },
        {
          key: 'chores',
          label: 'Tarefas',
          weight: 0.1,
          metrics: [{ key: 'made_bed' }],
        },
        {
          key: 'laundry_only',
          label: 'Lavanderia',
          weight: 0.1,
          metrics: [{ key: 'did_laundry' }],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    const laundry = progress.categories.find((c) => c.key === 'laundry_only');
    expect(laundry?.score).toBeNull();
    // (0.5·1 + 0.3·1 + 0.1·0) / 0.9
    expect(progress.totalScore).toBeCloseTo(0.8 / 0.9, 10);
    expect(progress.projectedAwardCents).toBe(Math.round((0.8 / 0.9) * 50000));
  });

  it('starts scoring at starts_on and returns nulls with no logs', () => {
    const noLogs = computeGoalProgress(
      program([
        {
          key: 'nutrition',
          label: 'Nutrição',
          weight: 1,
          metrics: [{ key: 'breakfast' }],
        },
      ]),
      DEFS,
      [],
      '2026-08',
    );
    expect(noLogs.totalScore).toBeNull();
    expect(noLogs.projectedAwardCents).toBeNull();

    const midMonth = computeGoalProgress(
      {
        ...program([
          {
            key: 'nutrition',
            label: 'Nutrição',
            weight: 1,
            metrics: [{ key: 'breakfast' }],
          },
        ]),
        starts_on: '2026-08-10',
      },
      DEFS,
      [
        { log_date: '2026-08-05', values: { breakfast: false } }, // pre-start
        { log_date: '2026-08-11', values: { breakfast: true } },
      ],
      '2026-08',
    );
    expect(midMonth.periodStart).toBe('2026-08-10');
    expect(midMonth.categories[0].score).toBe(1);
  });

  it("ignores entries that don't carry a metric (role-scoped days)", () => {
    // Monday only Alex Doe's self-report exists — no chores keys in its values,
    // so the chores category must not treat the day as a zero
    const entries = [
      { log_date: '2026-08-03', values: { who5_cheerful: 4 } },
      { log_date: '2026-08-04', values: { made_bed: true, breakfast: true } },
    ];
    const progress = computeGoalProgress(
      program([
        {
          key: 'chores',
          label: 'Tarefas',
          weight: 1,
          metrics: [{ key: 'made_bed' }],
        },
      ]),
      DEFS,
      entries,
      '2026-08',
    );
    // Only Tuesday counts, and it was met
    expect(progress.categories[0].score).toBe(1);
  });
});

describe('computeGoalRunRate', () => {
  const CATEGORIES: GoalProgramRow['categories'] = [
    {
      key: 'nutrition',
      label: 'Nutrição',
      weight: 0.5,
      metrics: [{ key: 'breakfast' }],
    },
    {
      key: 'cigarettes',
      label: 'Cigarros',
      weight: 0.5,
      metrics: [
        { key: 'cigarettes_count', rule: 'monthly_avg_max', target: 20 },
      ],
    },
  ];

  it('accumulates daily earnings and projects both scenarios', () => {
    // Two logged days: breakfast 1/2 met, cigarettes 30/day (score 20/30)
    const entries = [
      {
        log_date: '2026-08-01',
        values: { breakfast: true, cigarettes_count: 30 },
      },
      {
        log_date: '2026-08-02',
        values: { breakfast: false, cigarettes_count: 30 },
      },
    ];
    const runRate = computeGoalRunRate(
      program(CATEGORIES),
      DEFS,
      entries,
      '2026-08',
    );

    expect(runRate.lastLoggedDate).toBe('2026-08-02');
    expect(runRate.actual).toHaveLength(2);
    // Each day earns its weighted score × the daily quota (R$500 / 31)
    const quota = 50000 / 31;
    const day1 = (0.5 * 1 + 0.5 * (2 / 3)) * quota; // breakfast ✓, cigs 20/30
    const day2 = (0.5 * 0 + 0.5 * (2 / 3)) * quota; // breakfast ✗
    expect(runRate.actual[0].awardCents).toBe(Math.round(day1));
    expect(runRate.actual[1].awardCents).toBe(Math.round(day1 + day2));
    // Pace: the average daily earning carried across the 29 remaining days
    const accumulated = day1 + day2;
    expect(runRate.projectedPaceCents).toBe(
      Math.round(accumulated + (accumulated / 2) * 29),
    );
    // Perfect: every remaining day earns the full quota
    expect(runRate.projectedPerfectCents).toBe(
      Math.round(accumulated + 29 * quota),
    );
    expect(runRate.projectedPerfectCents).toBeGreaterThan(
      runRate.projectedPaceCents!,
    );
  });

  it('cannot invent appointments in the perfect scenario', () => {
    const categories: GoalProgramRow['categories'] = [
      {
        key: 'appointments',
        label: 'Consultas',
        weight: 1,
        metrics: [{ key: 'appointment_attended' }],
      },
    ];
    const entries = [
      {
        log_date: '2026-08-03',
        values: {
          appointment_type: 'psychologist',
          appointment_attended: false,
        },
      },
    ];
    const runRate = computeGoalRunRate(
      program(categories),
      DEFS,
      entries,
      '2026-08',
    );
    // The one scheduled appointment was missed; perfect future days carry
    // no appointments, so the scenario cannot repair the category
    expect(runRate.projectedPerfectCents).toBe(0);
  });

  it('returns nulls with no logged days', () => {
    const runRate = computeGoalRunRate(
      program(CATEGORIES),
      DEFS,
      [],
      '2026-08',
    );
    expect(runRate.lastLoggedDate).toBeNull();
    expect(runRate.actual).toHaveLength(0);
    expect(runRate.projectedPerfectCents).toBeNull();
    expect(runRate.projectedPaceCents).toBeNull();
  });
});

describe('grocery discretionary share (invoice pipeline)', () => {
  it('aggregates items into one share entry per shopping day', () => {
    const entries = groceryShareEntries([
      item('2026-08-13', 900, true),
      item('2026-08-06', 8800, false),
      item('2026-08-06', 1200, true),
      item('2026-08-13', 8100, false),
    ]);
    expect(entries).toEqual([
      { log_date: '2026-08-06', values: { [GROCERY_SHARE_KEY]: 12 } },
      { log_date: '2026-08-13', values: { [GROCERY_SHARE_KEY]: 10 } },
    ]);
  });

  it('skips days whose items net to zero or less', () => {
    const entries = groceryShareEntries([
      item('2026-08-06', 500, false),
      item('2026-08-06', -500, false),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('scores the month average of trip shares against the cap', () => {
    const categories = [
      {
        key: 'household_chores',
        label: 'Tarefas domésticas',
        weight: 1,
        metrics: [
          {
            key: GROCERY_SHARE_KEY,
            rule: 'monthly_avg_max' as const,
            target: 20,
            label: 'Supermercado',
          },
        ],
      },
    ];
    const definitions = [...DEFS, groceryShareDefinition()];
    const under = computeGoalProgress(
      program(categories),
      definitions,
      groceryShareEntries([
        item('2026-08-06', 8800, false),
        item('2026-08-06', 1200, true),
        item('2026-08-13', 7200, false),
        item('2026-08-13', 2800, true),
      ]),
      '2026-08',
    );
    // Shares 12% and 28% average to 20% — right at the cap
    const metric = under.categories[0].metrics[0];
    expect(metric.score).toBe(1);
    expect(metric.detail.average).toBe(20);
    expect(metric.detail.days).toBe(2);

    const over = computeGoalProgress(
      program(categories),
      definitions,
      groceryShareEntries([
        item('2026-08-06', 7500, false),
        item('2026-08-06', 2500, true),
      ]),
      '2026-08',
    );
    // A single 25% trip scores proportionally: 20/25
    expect(over.categories[0].metrics[0].score).toBeCloseTo(0.8);
  });
});

describe('groceryBreakdown (Supermercado card)', () => {
  it('totals the month and ranks discretionary categories by spend', () => {
    const breakdown = groceryBreakdown([
      item('2026-08-06', 8800, false, 'hortifruti'),
      item('2026-08-06', 700, true, 'doces'),
      item('2026-08-06', 500, true, 'salgadinhos'),
      item('2026-08-13', 6900, false, 'açougue'),
      item('2026-08-13', 1900, true, 'doces'),
      item('2026-08-13', 900, true, 'refrigerantes'),
      item('2026-08-13', 300, true, 'sorvetes'),
    ]);
    expect(breakdown).toEqual({
      totalCents: 20000,
      discretionaryCents: 4300,
      share: 0.215,
      // sorvetes (4th largest) falls off the top-3 ranking
      topCategories: [
        { category: 'doces', amountCents: 2600 },
        { category: 'refrigerantes', amountCents: 900 },
        { category: 'salgadinhos', amountCents: 500 },
      ],
    });
  });

  it('breaks spend ties alphabetically and drops non-positive categories', () => {
    const breakdown = groceryBreakdown([
      item('2026-08-06', 1000, false),
      item('2026-08-06', 300, true, 'doces'),
      item('2026-08-06', 300, true, 'chocolates'),
      // a discount voids the category entirely
      item('2026-08-06', 200, true, 'sorvetes'),
      item('2026-08-06', -200, true, 'sorvetes'),
    ]);
    expect(breakdown?.topCategories).toEqual([
      { category: 'chocolates', amountCents: 300 },
      { category: 'doces', amountCents: 300 },
    ]);
  });

  it('returns null with no items or a month netting to zero or less', () => {
    expect(groceryBreakdown([])).toBeNull();
    expect(
      groceryBreakdown([
        item('2026-08-06', 500, false),
        item('2026-08-06', -500, false),
      ]),
    ).toBeNull();
  });
});
