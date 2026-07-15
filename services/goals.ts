import {
  isDueToday,
  weekdayMon0FromDateStr,
  MetricDefinitionRow,
} from './dynamicLog';

// Goal-program scoring (M6): the monthly award is earned by meeting the
// goals the care team logs through the daily check-in. Categories, weights
// and per-metric rules are per-recipient DATA (goal_programs.categories);
// this module is pure math over metric definitions + log entries.
//
// Scoring is proportional at every level unless a rule says otherwise:
// - a category is the plain average of its sub-goal scores (equal weight);
// - a day-scored sub-goal is the average of its daily scores;
// - a medication checklist day scores the fraction of items taken;
// - 'min_hours' scores hours/target per night, capped at 1;
// - 'monthly_avg_max' compares the month's average against the cap and
//   scores target/average when over it;
// - 'wake_by' is inherently a threshold, so each day is met or not — the
//   month proportion supplies the gradient.
//
// Only days with at least one log entry are evaluated — the patient is
// never penalized for a check-in the team did not submit. A sub-goal whose
// metric depends on another (config.depends_on) is skipped on days its
// parent is empty (no appointment scheduled = nothing to attend).

export interface GoalMetricRule {
  key: string;
  /** Omitted → scored by the metric's value type (boolean / checklist) */
  rule?:
    | 'monthly_avg_max'
    | 'min_hours'
    | 'wake_by'
    | 'checklist_item'
    | 'parent_value';
  /** monthly_avg_max: the cap; min_hours: hours per night */
  target?: number;
  /** wake_by limits, HH:MM */
  weekday?: string;
  weekend?: string;
  /** checklist_item: the item name inside the checklist (one med) */
  item?: string;
  /** parent_value: score only on days the parent equals this answer */
  value?: string;
  /** Display label override (e.g. the appointment type's name) */
  label?: string;
  /** Unit text for balloons, e.g. " por dia" or "% das compras" */
  unit?: string;
}

export interface GoalCategory {
  key: string;
  label: string;
  weight: number;
  metrics: GoalMetricRule[];
}

export interface GoalProgramRow {
  id: string;
  starts_on: string;
  monthly_award_cents: number;
  currency: string;
  categories: GoalCategory[];
  active: boolean;
}

export interface LogEntryLite {
  log_date: string;
  values: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Supermercado (M7): the discretionary share of grocery spend comes from
// classified invoice line items (invoice_items) — populated by whichever
// processor reads the uploaded receipts — not from a form metric. The
// route converts those rows into synthetic log entries under a
// virtual metric key, so the engine scores them with the ordinary
// monthly_avg_max rule — every shopping trip contributes its own share and
// the month averages them.

export const GROCERY_SHARE_KEY = 'grocery_discretionary_share';

export interface InvoiceItemLite {
  purchase_date: string;
  amount_cents: number;
  discretionary: boolean;
  // Free-text pt-BR category from the classifier (e.g. 'doces')
  category: string;
}

/** The virtual metric definition backing GROCERY_SHARE_KEY. */
export function groceryShareDefinition(): MetricDefinitionRow {
  return {
    key: GROCERY_SHARE_KEY,
    label: 'Supermercado',
    short_label: 'Supermercado',
    value_type: 'number',
    config: { min: 0, max: 100 },
    cadence: 'daily', // shopping can happen any day; evidence-gated anyway
    cadence_day: null,
    cadence_days: null,
    cadence_start: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    active: true,
  };
}

/**
 * One synthetic entry per shopping day: the percentage of that day's grocery
 * spend classified as discretionary. Days whose items net to zero or less
 * (all-discount edge case) are skipped — no meaningful share to score.
 */
export function groceryShareEntries(items: InvoiceItemLite[]): LogEntryLite[] {
  const byDate = new Map<string, { total: number; discretionary: number }>();
  for (const item of items) {
    const sums = byDate.get(item.purchase_date) ?? {
      total: 0,
      discretionary: 0,
    };
    sums.total += item.amount_cents;
    if (item.discretionary) sums.discretionary += item.amount_cents;
    byDate.set(item.purchase_date, sums);
  }
  const entries: LogEntryLite[] = [];
  for (const [date, sums] of byDate) {
    if (sums.total <= 0) continue;
    entries.push({
      log_date: date,
      values: {
        [GROCERY_SHARE_KEY]: (100 * sums.discretionary) / sums.total,
      },
    });
  }
  return entries.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

/** Month totals behind the Supermercado goal, for the breakdown card. */
export interface GroceryBreakdown {
  totalCents: number;
  discretionaryCents: number;
  /** Discretionary share of the month's spend, 0–1 */
  share: number;
  /** Discretionary categories by spend, largest first */
  topCategories: { category: string; amountCents: number }[];
}

/**
 * Aggregates the month's classified grocery items: total spend, the
 * discretionary slice, and the discretionary categories ranked by spend.
 * Null when there is nothing meaningful to show (no items, or the month
 * nets to zero or less). Note this is the aggregate month share — the goal
 * score averages per-trip shares instead, so the two can differ.
 */
export function groceryBreakdown(
  items: InvoiceItemLite[],
  topN = 3,
): GroceryBreakdown | null {
  let totalCents = 0;
  let discretionaryCents = 0;
  const byCategory = new Map<string, number>();
  for (const item of items) {
    totalCents += item.amount_cents;
    if (!item.discretionary) continue;
    discretionaryCents += item.amount_cents;
    byCategory.set(
      item.category,
      (byCategory.get(item.category) ?? 0) + item.amount_cents,
    );
  }
  if (totalCents <= 0) return null;
  const topCategories = [...byCategory.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .filter((entry) => entry.amountCents > 0)
    .sort(
      (a, b) =>
        b.amountCents - a.amountCents || a.category.localeCompare(b.category),
    )
    .slice(0, topN);
  return {
    totalCents,
    discretionaryCents,
    share: discretionaryCents / totalCents,
    topCategories,
  };
}

/** Absolute month-to-date figures behind a sub-goal's score. */
export interface GoalMetricDetail {
  /** Days evaluated so far (logged, due, with evidence) */
  days: number;
  /** Sum of the daily scores — "days achieved", fractional for checklists */
  achieved: number | null;
  /** MTD average value (cigarette count / sleep hours), when applicable */
  average: number | null;
  target: number | null;
  weekday?: string;
  weekend?: string;
  /** Unit text for balloons (from the rule) */
  unit?: string;
}

export interface GoalMetricProgress {
  key: string;
  /** The metric definition's display label (falls back to the key) */
  label: string;
  rule: string;
  /** 0..1; null when nothing was scoreable yet */
  score: number | null;
  detail: GoalMetricDetail;
}

export interface CategoryProgress {
  key: string;
  label: string;
  weight: number;
  metrics: GoalMetricProgress[];
  /** Average of the sub-goal scores with data; null when none have data */
  score: number | null;
}

export interface GoalProgress {
  month: string; // YYYY-MM
  periodStart: string;
  periodEnd: string;
  categories: CategoryProgress[];
  /** Weighted total, renormalized over categories with data; null = no data */
  totalScore: number | null;
  projectedAwardCents: number | null;
}

const TIME_RE = /^\d{2}:\d{2}$/;

function hoursOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const range = value as { start?: unknown; end?: unknown; hours?: unknown };
  if (typeof range.hours === 'number') return range.hours;
  if (
    typeof range.start !== 'string' ||
    typeof range.end !== 'string' ||
    !TIME_RE.test(range.start) ||
    !TIME_RE.test(range.end)
  ) {
    return null;
  }
  const [sh, sm] = range.start.split(':').map(Number);
  const [eh, em] = range.end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

function isWeekend(dateStr: string): boolean {
  const weekday = weekdayMon0FromDateStr(dateStr);
  return weekday === 5 || weekday === 6;
}

/**
 * One entry's score for a day-scored sub-goal, 0..1. Null = nothing to
 * evaluate (dependency not triggered, or the value is absent for a rule
 * that needs one).
 */
export function entryDayScore(
  rule: GoalMetricRule,
  def: MetricDefinitionRow,
  values: Record<string, unknown>,
  date: string,
): number | null {
  // Entries are role-scoped (M6): a key absent from the values object means
  // this entry's author doesn't fill that metric — no evidence either way.
  // An explicit null, by contrast, means "logged as not happened".
  if (!(rule.key in values)) return null;
  const value = values[rule.key];

  if (rule.rule === 'min_hours') {
    const hours = hoursOf(value);
    if (hours === null || !rule.target) return null;
    return Math.min(1, hours / rule.target);
  }

  if (rule.rule === 'wake_by') {
    if (typeof value !== 'object' || value === null) return null;
    const end = (value as { end?: unknown }).end;
    if (typeof end !== 'string' || !TIME_RE.test(end)) return null;
    const limit = isWeekend(date) ? rule.weekend : rule.weekday;
    if (!limit) return null;
    return end <= limit ? 1 : 0;
  }

  // One medication out of the checklist: met when that item was taken
  if (rule.rule === 'checklist_item') {
    if (!Array.isArray(value)) return value === null ? 0 : null;
    const item = value.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { name?: unknown }).name === rule.item,
    );
    if (!item) return null; // med not in that day's checklist — no evidence
    return (item as { taken?: unknown }).taken === true ? 1 : 0;
  }

  // One branch of a dependent metric: only days the parent gave this
  // answer count (e.g. attendance at psychologist appointments only)
  if (rule.rule === 'parent_value') {
    const parent = def.config.depends_on;
    if (!parent || !rule.value) return null;
    const parentValue = values[parent] ?? null;
    if (parentValue === null || String(parentValue) !== rule.value) {
      return null;
    }
    return value === true ? 1 : 0;
  }

  // Default: scored by value type. A dependent metric only counts when its
  // parent has a real value ("none" = nothing scheduled); then an empty
  // value means "did not happen" → 0.
  const parent = def.config.depends_on;
  if (parent) {
    const parentValue = values[parent] ?? null;
    if (parentValue === null || parentValue === 'none') return null;
  }

  switch (def.value_type) {
    case 'boolean':
      return value === true ? 1 : 0;
    case 'medication_checklist': {
      if (!Array.isArray(value) || value.length === 0) return 0;
      const taken = value.filter(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          (item as { taken?: unknown }).taken === true,
      ).length;
      return taken / value.length;
    }
    default:
      return null; // not scoreable by type — needs an explicit rule
  }
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthEnd(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

/**
 * Progress of one month of the program, evaluated from the later of the
 * program start and the 1st through month-end. Days without a log entry
 * are skipped, so evaluating a month that is still running (or has not
 * begun) simply scores whatever has been logged so far.
 */
export function computeGoalProgress(
  program: GoalProgramRow,
  definitions: MetricDefinitionRow[],
  entries: LogEntryLite[],
  month: string,
): GoalProgress {
  const periodStart =
    program.starts_on > `${month}-01` ? program.starts_on : `${month}-01`;
  const periodEnd = monthEnd(month);

  const defsByKey = new Map(
    definitions.filter((def) => def.active).map((def) => [def.key, def]),
  );
  const entriesByDate = new Map<string, LogEntryLite[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.log_date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.log_date, list);
  }

  // Logged days on which a given metric is due, computed once per metric key
  const dueDaysCache = new Map<string, string[]>();
  const dueDaysFor = (def: MetricDefinitionRow): string[] => {
    const cached = dueDaysCache.get(def.key);
    if (cached) return cached;
    const days: string[] = [];
    for (let date = periodStart; date <= periodEnd; date = addDays(date, 1)) {
      if (!entriesByDate.has(date)) continue;
      if (isDueToday(def, weekdayMon0FromDateStr(date), date)) days.push(date);
    }
    dueDaysCache.set(def.key, days);
    return days;
  };

  const scoreMetric = (
    rule: GoalMetricRule,
  ): { score: number | null; detail: GoalMetricDetail } => {
    const detail: GoalMetricDetail = {
      days: 0,
      achieved: null,
      average: null,
      target: rule.target ?? null,
      ...(rule.unit !== undefined ? { unit: rule.unit } : {}),
      ...(rule.rule === 'wake_by'
        ? { weekday: rule.weekday, weekend: rule.weekend }
        : {}),
    };
    const def = defsByKey.get(rule.key);
    if (!def) return { score: null, detail };
    const days = dueDaysFor(def);

    if (rule.rule === 'monthly_avg_max') {
      if (!rule.target) return { score: null, detail };
      // Month average of the day values (a day with several entries
      // averages them first), compared against the cap
      const dayValues: number[] = [];
      for (const date of days) {
        const nums = (entriesByDate.get(date) ?? [])
          .map((entry) => entry.values[rule.key])
          .filter((v): v is number => typeof v === 'number');
        const dayAvg = mean(nums);
        if (dayAvg !== null) dayValues.push(dayAvg);
      }
      const avg = mean(dayValues);
      detail.days = dayValues.length;
      detail.average = avg;
      if (avg === null) return { score: null, detail };
      return {
        score: avg <= rule.target ? 1 : rule.target / avg,
        detail,
      };
    }

    // Day-scored rules: best entry of each day, averaged over the month
    const dayScores: number[] = [];
    const dayHours: number[] = [];
    for (const date of days) {
      const dayEntries = entriesByDate.get(date) ?? [];
      const scores = dayEntries
        .map((entry) => entryDayScore(rule, def, entry.values, date))
        .filter((score): score is number => score !== null);
      if (scores.length > 0) dayScores.push(Math.max(...scores));
      if (rule.rule === 'min_hours') {
        const hours = dayEntries
          .map((entry) => hoursOf(entry.values[rule.key]))
          .filter((h): h is number => h !== null);
        if (hours.length > 0) dayHours.push(Math.max(...hours));
      }
    }
    detail.days = dayScores.length;
    detail.achieved = dayScores.reduce((sum, s) => sum + s, 0);
    if (rule.rule === 'min_hours') detail.average = mean(dayHours);
    return { score: mean(dayScores), detail };
  };

  const categories: CategoryProgress[] = program.categories.map((category) => {
    const metrics: GoalMetricProgress[] = category.metrics.map((rule) => {
      const { score, detail } = scoreMetric(rule);
      const def = defsByKey.get(rule.key);
      return {
        key: rule.key,
        label:
          rule.label ?? rule.item ?? def?.short_label ?? def?.label ?? rule.key,
        rule: rule.rule ?? 'auto',
        score,
        detail,
      };
    });
    // Sub-goals weigh equally; those without data yet stay out of the mean
    const score = mean(
      metrics
        .map((metric) => metric.score)
        .filter((s): s is number => s !== null),
    );
    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      metrics,
      score,
    };
  });

  let weightWithData = 0;
  let weightedSum = 0;
  for (const category of categories) {
    if (category.score !== null) {
      weightWithData += category.weight;
      weightedSum += category.weight * category.score;
    }
  }

  const totalScore = weightWithData > 0 ? weightedSum / weightWithData : null;
  return {
    month,
    periodStart,
    periodEnd,
    categories,
    totalScore,
    projectedAwardCents:
      totalScore === null
        ? null
        : Math.round(totalScore * program.monthly_award_cents),
  };
}

// ---------------------------------------------------------------------------
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
