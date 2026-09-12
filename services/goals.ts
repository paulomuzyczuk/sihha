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
  /** parent_value: several parent answers this one goal catches (e.g. an
      "Outros" appointment goal absorbing nutritionist / dentist / eye_doctor).
      When present it supersedes `value`. */
  values?: string[];
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
  /** Stable, localization-free sub-goal identity (see goalRuleUid). */
  uid: string;
  key: string;
  /** The metric definition's display label (falls back to the key) */
  label: string;
  rule: string;
  /** 0..1; null when nothing was scoreable yet */
  score: number | null;
  detail: GoalMetricDetail;
}

/**
 * A sub-goal's stable identity — key + rule + its disambiguator (parent_value
 * answer or checklist item). Two sleep rules share the 'sleep' key but differ
 * by rule; four appointment sub-goals share key AND rule 'parent_value' but
 * differ by value. Deliberately localization-free so the goal-series endpoint
 * and the client agree without passing display labels around.
 */
export function goalRuleUid(rule: GoalMetricRule): string {
  const disambiguator = rule.value ?? rule.item ?? rule.values?.join('|') ?? '';
  return `${rule.key}::${rule.rule ?? 'auto'}::${disambiguator}`;
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

// Range-validating: '25:99' must read as junk, not as a scoreable time —
// caught by the A17 property suite (a shape-only regex scored garbage input).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hoursOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const range = value as { start?: unknown; end?: unknown; hours?: unknown };
  if (typeof range.hours === 'number') {
    // Junk guard (A17 property finding): a negative or non-finite hours
    // payload must read as no-evidence, not as a below-zero score
    return Number.isFinite(range.hours) && range.hours >= 0
      ? range.hours
      : null;
  }
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

  // One branch of a dependent metric: only days the parent gave one of this
  // goal's answers count (e.g. attendance at psychologist appointments, or an
  // "Outros" goal that catches every non-primary appointment type). `values`
  // lists several accepted answers; `value` is the single-answer shorthand.
  if (rule.rule === 'parent_value') {
    const parent = def.config.depends_on;
    const accepted = rule.values ?? (rule.value ? [rule.value] : []);
    if (!parent || accepted.length === 0) return null;
    const parentValue = values[parent] ?? null;
    if (parentValue === null || !accepted.includes(String(parentValue))) {
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

// Exported for goalRunRate.ts (A26 split) — same-day arithmetic must
// stay identical on both sides of the seam.
export function addDays(dateStr: string, days: number): string {
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

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

/** Group log entries by date for O(1) per-day lookup. */
export function buildEntriesByDate(
  entries: LogEntryLite[],
): Map<string, LogEntryLite[]> {
  const byDate = new Map<string, LogEntryLite[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.log_date) ?? [];
    list.push(entry);
    byDate.set(entry.log_date, list);
  }
  return byDate;
}

/** Logged days in [start, end] (inclusive) on which the metric is due. */
export function dueDaysInRange(
  def: MetricDefinitionRow,
  entriesByDate: Map<string, LogEntryLite[]>,
  start: string,
  end: string,
): string[] {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (!entriesByDate.has(date)) continue;
    if (isDueToday(def, weekdayMon0FromDateStr(date), date)) days.push(date);
  }
  return days;
}

/** The base detail object for a rule before any day is scored. */
function baseDetail(rule: GoalMetricRule): GoalMetricDetail {
  return {
    days: 0,
    achieved: null,
    average: null,
    target: rule.target ?? null,
    ...(rule.unit !== undefined ? { unit: rule.unit } : {}),
    ...(rule.rule === 'wake_by'
      ? { weekday: rule.weekday, weekend: rule.weekend }
      : {}),
  };
}

/**
 * A sub-goal's attainment (0..1, null = nothing scoreable) plus the absolute
 * figures behind it, evaluated over an arbitrary set of due days. Extracted
 * from computeGoalProgress (A26 seam) so the intra-month / weekly goal series
 * (services/goalSeries.ts) score the identical math over their own windows —
 * a whole month, one ISO week, or a single day.
 */
export function scoreRuleOverDays(
  rule: GoalMetricRule,
  def: MetricDefinitionRow,
  entriesByDate: Map<string, LogEntryLite[]>,
  days: string[],
): { score: number | null; detail: GoalMetricDetail } {
  const detail = baseDetail(rule);

  if (rule.rule === 'monthly_avg_max') {
    if (!rule.target) return { score: null, detail };
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
    return { score: avg <= rule.target ? 1 : rule.target / avg, detail };
  }

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
  const entriesByDate = buildEntriesByDate(entries);

  // Logged due-days per metric key, computed once (several rules share a key)
  const dueDaysCache = new Map<string, string[]>();
  const dueDaysFor = (def: MetricDefinitionRow): string[] => {
    const cached = dueDaysCache.get(def.key);
    if (cached) return cached;
    const days = dueDaysInRange(def, entriesByDate, periodStart, periodEnd);
    dueDaysCache.set(def.key, days);
    return days;
  };

  const categories: CategoryProgress[] = program.categories.map((category) => {
    const metrics: GoalMetricProgress[] = category.metrics.map((rule) => {
      const def = defsByKey.get(rule.key);
      const { score, detail } = def
        ? scoreRuleOverDays(rule, def, entriesByDate, dueDaysFor(def))
        : { score: null, detail: baseDetail(rule) };
      return {
        uid: goalRuleUid(rule),
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
