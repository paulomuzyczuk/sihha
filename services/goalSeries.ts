import { weekdayMon0FromDateStr, MetricDefinitionRow } from './dynamicLog';
import {
  addDays,
  buildEntriesByDate,
  dueDaysInRange,
  goalRuleUid,
  monthEnd,
  scoreRuleOverDays,
  GoalCategory,
  GoalMetricRule,
  GoalProgramRow,
  LogEntryLite,
} from './goals';

// Goal sub-goal time series (M6 perspective switcher): the detail view can
// look at one sub-goal three ways — intra-month as accumulated R$ prize (its
// own award slice), the last 8 ISO weeks as % attainment, and the last 12
// months as % attainment (that third one the client already has from the
// per-month history it fetches, so it is not recomputed here). Every score
// reuses services/goals.ts scoreRuleOverDays so the math never diverges.

/** One day of the intra-month accumulated-prize line, in cents. */
export interface GoalMoneyPoint {
  date: string;
  awardCents: number;
}

/** One weekly (or monthly) attainment bucket, 0..100 or null (no evidence). */
export interface GoalPctPoint {
  bucket: string; // the bucket's start date (YYYY-MM-DD)
  pct: number | null;
}

export interface GoalSubSeries {
  uid: string;
  /** This sub-goal's nominal slice of the monthly award (cents). */
  sliceCents: number;
  /** Intra-month: cumulative R$ this sub-goal has banked (MTD-1). */
  daily: GoalMoneyPoint[];
  /** Last 8 ISO weeks: % attainment per week. */
  weekly: GoalPctPoint[];
}

interface WeekBucket {
  start: string;
  end: string;
}

/** The Monday (Mon=0) opening the ISO week that contains `date`. */
function isoWeekStart(date: string): string {
  return addDays(date, -weekdayMon0FromDateStr(date));
}

/** The 8 ISO weeks (oldest→newest) ending with the week that holds `today`. */
export function last8Weeks(today: string): WeekBucket[] {
  const thisMonday = isoWeekStart(today);
  const weeks: WeekBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    weeks.push({ start, end: addDays(start, 6) });
  }
  return weeks;
}

/**
 * A sub-goal's nominal award slice: its category's weight share of the whole
 * award, split evenly across that category's sub-goals — the same equal-weight
 * split the category score uses. A fixed slice (not day-renormalized), so the
 * accumulated line has a stable ceiling; an estimate, per the design note.
 */
export function subgoalSliceCents(
  program: GoalProgramRow,
  category: GoalCategory,
): number {
  const totalWeight =
    program.categories.reduce((sum, c) => sum + c.weight, 0) || 1;
  const perSub = category.metrics.length > 0 ? 1 / category.metrics.length : 0;
  return (program.monthly_award_cents * category.weight * perSub) / totalWeight;
}

/**
 * Intra-month accumulated prize (cents) for one sub-goal: each due, logged day
 * banks its day-score × the sub-goal's daily quota, summed from the period
 * start. Runs to yesterday for the live month (MTD-1); for a past or a not-yet-
 * started month it runs to month-end, so a browsed month still draws fully.
 */
function computeSubgoalDailyMoney(
  rule: GoalMetricRule,
  def: MetricDefinitionRow,
  sliceCents: number,
  entriesByDate: Map<string, LogEntryLite[]>,
  periodStart: string,
  periodEnd: string,
  today: string,
): GoalMoneyPoint[] {
  const mtdEnd = addDays(today, -1);
  const end =
    mtdEnd < periodStart ? periodEnd : mtdEnd > periodEnd ? periodEnd : mtdEnd;

  let periodDays = 0;
  for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) periodDays += 1;
  const dailyQuota = periodDays > 0 ? sliceCents / periodDays : 0;

  const points: GoalMoneyPoint[] = [];
  let accumulated = 0;
  for (let date = periodStart; date <= end; date = addDays(date, 1)) {
    const dueToday = dueDaysInRange(def, entriesByDate, date, date);
    const { score } = scoreRuleOverDays(rule, def, entriesByDate, dueToday);
    if (score !== null) accumulated += score * dailyQuota;
    points.push({ date, awardCents: Math.round(accumulated) });
  }
  return points;
}

/** Per-week % attainment for one sub-goal over the given week buckets. */
function computeSubgoalWeekly(
  rule: GoalMetricRule,
  def: MetricDefinitionRow,
  entriesByDate: Map<string, LogEntryLite[]>,
  weeks: WeekBucket[],
): GoalPctPoint[] {
  return weeks.map((week) => {
    const days = dueDaysInRange(def, entriesByDate, week.start, week.end);
    const { score } = scoreRuleOverDays(rule, def, entriesByDate, days);
    return {
      bucket: week.start,
      pct: score === null ? null : Math.round(score * 1000) / 10,
    };
  });
}

/**
 * The intra-month (R$) and 8-week (%) series for every sub-goal of the active
 * program, keyed by goalRuleUid so the client matches them to its cards. The
 * 12-month view reuses the per-month history the client already holds.
 */
export function computeGoalSeries(
  program: GoalProgramRow,
  definitions: MetricDefinitionRow[],
  entries: LogEntryLite[],
  month: string,
  today: string,
): GoalSubSeries[] {
  const defsByKey = new Map(
    definitions.filter((def) => def.active).map((def) => [def.key, def]),
  );
  const entriesByDate = buildEntriesByDate(entries);
  const periodStart =
    program.starts_on > `${month}-01` ? program.starts_on : `${month}-01`;
  const periodEnd = monthEnd(month);
  const weeks = last8Weeks(today);

  const series: GoalSubSeries[] = [];
  for (const category of program.categories) {
    const sliceCents = subgoalSliceCents(program, category);
    for (const rule of category.metrics) {
      const def = defsByKey.get(rule.key);
      series.push({
        uid: goalRuleUid(rule),
        sliceCents: Math.round(sliceCents),
        daily: def
          ? computeSubgoalDailyMoney(
              rule,
              def,
              sliceCents,
              entriesByDate,
              periodStart,
              periodEnd,
              today,
            )
          : [],
        weekly: def
          ? computeSubgoalWeekly(rule, def, entriesByDate, weeks)
          : weeks.map((week) => ({ bucket: week.start, pct: null })),
      });
    }
  }
  return series;
}
