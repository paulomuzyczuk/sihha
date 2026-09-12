import {
  weekdayMon0FromDateStr,
  type MetricDefinitionRow,
} from '../../services/dynamicLog';
import type { GoalProgramRow, LogEntryLite } from '../../services/goals';
import {
  computeGoalSeries,
  last8Weeks,
  subgoalSliceCents,
} from '../../services/goalSeries';

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

const PROGRAM: GoalProgramRow = {
  id: 'p1',
  starts_on: '2026-03-01',
  monthly_award_cents: 30000, // R$300
  currency: 'BRL',
  active: true,
  categories: [
    {
      key: 'cat',
      label: 'Cat',
      weight: 1,
      metrics: [{ key: 'breakfast' }, { key: 'made_bed' }],
    },
  ],
};

const DEFS = [def({ key: 'breakfast' }), def({ key: 'made_bed' })];

// breakfast logged true on Mar 1–5, then nothing
const ENTRIES: LogEntryLite[] = ['01', '02', '03', '04', '05'].map((d) => ({
  log_date: `2026-03-${d}`,
  values: { breakfast: true, made_bed: true },
}));

const breakfastSeries = (today: string) =>
  computeGoalSeries(PROGRAM, DEFS, ENTRIES, '2026-03', today).find(
    (s) => s.uid === 'breakfast::auto::',
  )!;

describe('last8Weeks', () => {
  const dayGap = (a: string, b: string) =>
    (new Date(`${b}T00:00:00Z`).getTime() -
      new Date(`${a}T00:00:00Z`).getTime()) /
    86_400_000;

  it('returns 8 consecutive Monday-started weeks ending with today’s week', () => {
    const today = '2026-03-10';
    const weeks = last8Weeks(today);
    expect(weeks).toHaveLength(8);
    weeks.forEach((w) => {
      expect(weekdayMon0FromDateStr(w.start)).toBe(0); // Monday
      expect(dayGap(w.start, w.end)).toBe(6); // Mon→Sun
    });
    for (let i = 1; i < weeks.length; i++) {
      expect(dayGap(weeks[i - 1].start, weeks[i].start)).toBe(7);
    }
    const lastWeek = weeks[7];
    expect(lastWeek.start <= today && today <= lastWeek.end).toBe(true);
  });
});

describe('subgoalSliceCents', () => {
  it('splits the award by category weight share ÷ sub-goals', () => {
    // one category (weight 1 of 1) with 2 sub-goals → half each
    expect(subgoalSliceCents(PROGRAM, PROGRAM.categories[0])).toBe(15000);
  });
});

describe('computeGoalSeries — intra-month accumulated prize (R$)', () => {
  it('exposes each sub-goal’s slice keyed by uid', () => {
    const s = breakfastSeries('2026-03-10');
    expect(s.sliceCents).toBe(15000);
  });

  it('accumulates the slice only on scored days and never decreases', () => {
    const s = breakfastSeries('2026-03-10');
    const cents = s.daily.map((p) => p.awardCents);
    for (let i = 1; i < cents.length; i++) {
      expect(cents[i]).toBeGreaterThanOrEqual(cents[i - 1]);
    }
    // 5 perfect days × (15000 / 31 days) ≈ 2419
    expect(s.daily[s.daily.length - 1].awardCents).toBe(
      Math.round((5 * 15000) / 31),
    );
  });

  it('stops at yesterday for the live month (MTD-1)', () => {
    const s = breakfastSeries('2026-03-10');
    expect(s.daily[s.daily.length - 1].date).toBe('2026-03-09');
    expect(s.daily).toHaveLength(9);
  });

  it('draws the whole month for a not-yet-started (future) month', () => {
    const s = breakfastSeries('2026-02-15'); // before the month → browse-full
    expect(s.daily).toHaveLength(31);
    expect(s.daily[s.daily.length - 1].date).toBe('2026-03-31');
  });
});

describe('computeGoalSeries — weekly % attainment', () => {
  it('scores each of 8 weeks, null where no evidence', () => {
    const s = breakfastSeries('2026-03-10');
    expect(s.weekly).toHaveLength(8);
    // the week(s) holding the perfect Mar 1–5 days read 100%
    expect(s.weekly.some((w) => w.pct === 100)).toBe(true);
    // the oldest bucket (January) has no entries
    expect(s.weekly[0].pct).toBeNull();
  });
});
