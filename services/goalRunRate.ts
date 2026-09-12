import {
  isDueToday,
  weekdayMon0FromDateStr,
  MetricDefinitionRow,
} from './dynamicLog';
import {
  addDays,
  entryDayScore,
  GoalProgramRow,
  LogEntryLite,
  mean,
  monthEnd,
} from './goals';

// Split out of services/goals.ts (A26).
//
// Run rate: the month's trajectory so far plus two closing scenarios.

export interface GoalRunRatePoint {
  date: string;
  /** Cumulative projected award through this day; null before any data */
  awardCents: number | null;
}

export interface GoalRunRate {
  lastLoggedDate: string | null;
  /** One point per day from the period start through the last logged day */
  actual: GoalRunRatePoint[];
  /** Scenario 1 — everything scores perfectly from tomorrow on */
  projectedPerfectCents: number | null;
  /** Scenario 2 — the month closes at the current pace (ratios hold) */
  projectedPaceCents: number | null;
}

/**
 * Synthetic values that score 1 on every sub-goal: booleans true, checklists
 * fully taken, sleep long enough and up on time, capped averages at their
 * target. Dependent sub-goals get a "none" parent — a perfect future cannot
 * invent appointments, so those days simply stay out of that sub-goal.
 */
function perfectDayValues(
  program: GoalProgramRow,
  defsByKey: Map<string, MetricDefinitionRow>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  // Per-med sub-goals share one checklist key — collect the item names so
  // the perfect day carries every tracked med as taken
  const checklistItems = new Map<string, string[]>();
  for (const category of program.categories) {
    for (const rule of category.metrics) {
      if (rule.rule === 'checklist_item' && rule.item) {
        const items = checklistItems.get(rule.key) ?? [];
        items.push(rule.item);
        checklistItems.set(rule.key, items);
      }
    }
  }
  for (const [key, items] of checklistItems) {
    values[key] = items.map((name) => ({
      name,
      prescribed_dosage: 1,
      taken: true,
    }));
  }
  for (const category of program.categories) {
    for (const rule of category.metrics) {
      const def = defsByKey.get(rule.key);
      if (!def) continue;
      if (rule.rule === 'checklist_item') continue; // handled above
      if (rule.rule === 'min_hours' || rule.rule === 'wake_by') {
        values[rule.key] = {
          start: '23:00',
          end: '07:00',
          hours: Math.max(rule.target ?? 8, 8),
        };
        continue;
      }
      if (rule.rule === 'monthly_avg_max') {
        values[rule.key] = rule.target ?? 0;
        continue;
      }
      const parent = def.config.depends_on;
      if (parent) {
        if (!(parent in values)) values[parent] = 'none';
        values[rule.key] = null;
        continue;
      }
      switch (def.value_type) {
        case 'boolean':
          values[rule.key] = true;
          break;
        case 'medication_checklist':
          values[rule.key] = [
            { name: 'all', prescribed_dosage: 1, taken: true },
          ];
          break;
        default:
          break;
      }
    }
  }
  return values;
}

/**
 * One day's weighted score (0..1) from its entries alone: the day's
 * categories average their scoreable sub-goals, weights renormalize over
 * categories with evidence. Null when nothing was scoreable.
 */
export function computeGoalDayScore(
  program: GoalProgramRow,
  defsByKey: Map<string, MetricDefinitionRow>,
  dayEntries: LogEntryLite[],
  date: string,
): number | null {
  const weekday = weekdayMon0FromDateStr(date);
  let weightedSum = 0;
  let weightWithData = 0;
  for (const category of program.categories) {
    const scores: number[] = [];
    for (const rule of category.metrics) {
      const def = defsByKey.get(rule.key);
      if (!def || !isDueToday(def, weekday, date)) continue;
      if (rule.rule === 'monthly_avg_max') {
        if (!rule.target) continue;
        const nums = dayEntries
          .map((entry) => entry.values[rule.key])
          .filter((v): v is number => typeof v === 'number');
        const avg = mean(nums);
        if (avg === null) continue;
        scores.push(avg <= rule.target ? 1 : rule.target / avg);
        continue;
      }
      const dayScores = dayEntries
        .map((entry) => entryDayScore(rule, def, entry.values, date))
        .filter((score): score is number => score !== null);
      if (dayScores.length > 0) scores.push(Math.max(...dayScores));
    }
    const categoryScore = mean(scores);
    if (categoryScore !== null) {
      weightedSum += category.weight * categoryScore;
      weightWithData += category.weight;
    }
  }
  return weightWithData > 0 ? weightedSum / weightWithData : null;
}

/**
 * The accumulated month: each day earns its weighted score times the daily
 * quota (award ÷ days in the period), so the actual line is a running sum
 * from R$0 toward the full award. Scenario 1 finishes the month with
 * simulated perfect days (which cannot invent appointments); scenario 2
 * keeps earning at the average daily pace so far.
 */
export function computeGoalRunRate(
  program: GoalProgramRow,
  definitions: MetricDefinitionRow[],
  entries: LogEntryLite[],
  month: string,
): GoalRunRate {
  const periodStart =
    program.starts_on > `${month}-01` ? program.starts_on : `${month}-01`;
  const periodEnd = monthEnd(month);
  const inMonth = entries.filter(
    (entry) => entry.log_date >= periodStart && entry.log_date <= periodEnd,
  );
  const lastLoggedDate = inMonth.reduce<string | null>(
    (max, entry) =>
      max === null || entry.log_date > max ? entry.log_date : max,
    null,
  );
  if (!lastLoggedDate) {
    return {
      lastLoggedDate: null,
      actual: [],
      projectedPerfectCents: null,
      projectedPaceCents: null,
    };
  }

  const defsByKey = new Map(
    definitions.filter((def) => def.active).map((def) => [def.key, def]),
  );
  const entriesByDate = new Map<string, LogEntryLite[]>();
  for (const entry of inMonth) {
    const list = entriesByDate.get(entry.log_date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.log_date, list);
  }

  let periodDays = 0;
  for (let date = periodStart; date <= periodEnd; date = addDays(date, 1)) {
    periodDays += 1;
  }
  const dailyQuota = program.monthly_award_cents / periodDays;

  const actual: GoalRunRatePoint[] = [];
  let accumulated = 0;
  let elapsedDays = 0;
  for (
    let date = periodStart;
    date <= lastLoggedDate;
    date = addDays(date, 1)
  ) {
    elapsedDays += 1;
    const dayEntries = entriesByDate.get(date);
    if (dayEntries && dayEntries.length > 0) {
      const score = computeGoalDayScore(program, defsByKey, dayEntries, date);
      if (score !== null) accumulated += score * dailyQuota;
    }
    actual.push({ date, awardCents: Math.round(accumulated) });
  }

  const remainingDays = periodDays - elapsedDays;
  const projectedPaceCents = Math.round(
    accumulated + (accumulated / elapsedDays) * remainingDays,
  );

  const perfect = perfectDayValues(program, defsByKey);
  let perfectAccumulated = accumulated;
  for (
    let date = addDays(lastLoggedDate, 1);
    date <= periodEnd;
    date = addDays(date, 1)
  ) {
    const score = computeGoalDayScore(
      program,
      defsByKey,
      [{ log_date: date, values: perfect }],
      date,
    );
    if (score !== null) perfectAccumulated += score * dailyQuota;
  }

  return {
    lastLoggedDate,
    actual,
    projectedPerfectCents: Math.round(perfectAccumulated),
    projectedPaceCents,
  };
}
