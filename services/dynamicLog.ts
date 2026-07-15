import { z } from 'zod';

// Dynamic validation for care_log_entries.values: the schema is BUILT from
// the recipient's metric_definitions at request time — the platform's core
// "schema as data" move. Each value_type maps to one Zod validator; metrics
// that are not due on the recipient-local day must be null (the same
// semantics the legacy weekly household tasks had).

export interface MetricDefinitionRow {
  key: string;
  label: string;
  /** Trimmed name for compact surfaces (goal balloons); null → label */
  short_label?: string | null;
  value_type:
    | 'scale'
    | 'boolean'
    | 'number'
    | 'duration_minutes'
    | 'time_range'
    | 'enum'
    | 'medication_checklist'
    | 'text';
  config: {
    min?: number;
    max?: number;
    options?: Array<number | { value: string; label: string }>;
    depends_on?: string;
    /** With depends_on: applies only when the parent equals this value */
    depends_value?: string;
    /** Scale pills labeled per step, e.g. {"1": "Muito abatido"} */
    anchors?: Record<string, string>;
  };
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  cadence_day: number | null;
  cadence_days: number[] | null;
  cadence_start: string | null;
  /** Form grouping heading (per-circle data); null renders ungrouped */
  section?: string | null;
  /** Optional second grouping level inside the section */
  subsection?: string | null;
  /** Footnote at the bottom of the section's page (e.g. scale citation) */
  section_note?: string | null;
  filled_by: string;
  /** Specialist scope for clinician metrics; null = any clinician */
  clinician_profile?: string | null;
  required: boolean;
  sort_order: number;
  active: boolean;
}

/** Recipient-local calendar date (YYYY-MM-DD). */
export function localDate(timezone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Recipient-local weekday, Monday = 0 (schedule_config convention). */
export function localWeekdayMon0(
  timezone: string,
  date: Date = new Date(),
): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return order.indexOf(name);
}

/** Weekday (Monday = 0) of a YYYY-MM-DD calendar date. */
export function weekdayMon0FromDateStr(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Whether a metric is due on the recipient-local calendar day. Custom
 * cadences anchor to cadence_start (Google-Calendar semantics): weekly on
 * the cadence_days set (or the single cadence_day / the start date's
 * weekday), monthly on the start date's day-of-month (clamped in shorter
 * months), quarterly every third month — never before the start date.
 * Legacy weekly rows carry cadence_day and no start date.
 */
export function isDueToday(
  def: Pick<
    MetricDefinitionRow,
    'cadence' | 'cadence_day' | 'cadence_days' | 'cadence_start'
  >,
  weekdayMon0: number,
  todayLocalDate: string,
): boolean {
  if (def.cadence === 'daily') return true;
  if (def.cadence_start && todayLocalDate < def.cadence_start) return false;
  if (def.cadence === 'weekly') {
    if (def.cadence_days && def.cadence_days.length > 0) {
      return def.cadence_days.includes(weekdayMon0);
    }
    const day =
      def.cadence_day ??
      (def.cadence_start ? weekdayMon0FromDateStr(def.cadence_start) : null);
    return day === weekdayMon0;
  }
  if (!def.cadence_start) return false;
  const [startY, startM, startD] = def.cadence_start.split('-').map(Number);
  const [y, m, d] = todayLocalDate.split('-').map(Number);
  if (d !== Math.min(startD, daysInMonth(y, m))) return false;
  if (def.cadence === 'monthly') return true;
  return ((y - startY) * 12 + (m - startM)) % 3 === 0;
}

/**
 * Reserved enum value meaning "explicitly nothing today" ("Sem consulta
 * hoje"). It satisfies a required dropdown while leaving the metric's
 * dependents dormant, exactly like an empty parent.
 */
export const NONE_ENUM_VALUE = 'none';

/**
 * Whether a dependent metric's parent is empty, explicitly "none", or (when
 * depends_value narrows the trigger) any other answer than the one that
 * reveals this metric.
 */
export function parentIsEmpty(
  def: Pick<MetricDefinitionRow, 'config'>,
  values: Record<string, unknown>,
): boolean {
  const parent = def.config.depends_on;
  if (!parent) return false;
  const parentValue = values[parent] ?? null;
  if (parentValue === null || parentValue === NONE_ENUM_VALUE) return true;
  const trigger = def.config.depends_value;
  // String-compare so boolean parents work ("true" reveals on Sim)
  return trigger !== undefined && String(parentValue) !== trigger;
}

const TIME_RE = /^\d{2}:\d{2}$/;

const timeRangeSchema = z
  .object({
    start: z.string().regex(TIME_RE, 'must be HH:MM'),
    end: z.string().regex(TIME_RE, 'must be HH:MM'),
  })
  .transform((data) => {
    const [sh, sm] = data.start.split(':').map(Number);
    const [eh, em] = data.end.split(':').map(Number);
    const startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins <= startMins) endMins += 24 * 60; // midnight crossing
    return { ...data, hours: (endMins - startMins) / 60 };
  })
  .refine((data) => data.hours > 0 && data.hours < 24, {
    message: 'computed duration must be between 0 and 24 hours',
  });

const medicationChecklistSchema = z.array(
  z.object({
    name: z.string().min(1),
    prescribed_dosage: z.number().positive(),
    taken: z.boolean(),
  }),
);

function baseSchemaFor(def: MetricDefinitionRow): z.ZodTypeAny {
  switch (def.value_type) {
    case 'scale':
      return z
        .number()
        .int()
        .min(def.config.min ?? 1)
        .max(def.config.max ?? 5);
    case 'boolean':
      return z.boolean();
    case 'number': {
      let schema = z.number();
      if (def.config.min !== undefined) schema = schema.min(def.config.min);
      if (def.config.max !== undefined) schema = schema.max(def.config.max);
      return schema;
    }
    case 'duration_minutes': {
      const allowed = (def.config.options ?? []).filter(
        (option): option is number => typeof option === 'number',
      );
      const schema = z.number().int().positive();
      return allowed.length > 0
        ? schema.refine((v) => allowed.includes(v), {
            message: `must be one of ${allowed.join(', ')}`,
          })
        : schema;
    }
    case 'time_range':
      return timeRangeSchema;
    case 'enum': {
      const values = (def.config.options ?? [])
        .filter(
          (option): option is { value: string; label: string } =>
            typeof option === 'object',
        )
        .map((option) => option.value);
      return z.string().refine((v) => values.includes(v), {
        message: `must be one of ${values.join(', ')}`,
      });
    }
    case 'medication_checklist':
      return medicationChecklistSchema;
    case 'text':
      return z.string().trim().min(1).max(200);
  }
}

export type ValuesValidation =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; issues: string[] };

/**
 * Validates a raw values object against the recipient's active metric
 * definitions for the given recipient-local day. Unknown keys are
 * rejected; not-due metrics are forced to null; metrics whose
 * depends_on parent is null are coerced to null (e.g. exercise_minutes
 * without exercise_type).
 */
export function validateValues(
  definitions: MetricDefinitionRow[],
  weekdayMon0: number,
  todayLocalDate: string,
  raw: unknown,
): ValuesValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: ['values must be an object'] };
  }
  const input = raw as Record<string, unknown>;
  const active = definitions.filter((def) => def.active);
  const knownKeys = new Set(active.map((def) => def.key));

  const unknown = Object.keys(input).filter((key) => !knownKeys.has(key));
  if (unknown.length > 0) {
    return {
      ok: false,
      issues: [`unknown metric keys: ${unknown.join(', ')}`],
    };
  }

  const values: Record<string, unknown> = {};
  const issues: string[] = [];

  for (const def of active) {
    const provided = input[def.key];

    if (!isDueToday(def, weekdayMon0, todayLocalDate)) {
      if (provided != null) {
        issues.push(`${def.key}: not due today, must be null`);
      }
      values[def.key] = null;
      continue;
    }

    if (provided == null) {
      // A required dependent is exempt while its parent is empty/"none"
      if (def.required && !parentIsEmpty(def, input)) {
        issues.push(`${def.key}: required`);
      }
      values[def.key] = null;
      continue;
    }

    const result = baseSchemaFor(def).safeParse(provided);
    if (!result.success) {
      issues.push(
        `${def.key}: ${result.error.issues[0]?.message ?? 'invalid'}`,
      );
      continue;
    }
    values[def.key] = result.data;
  }

  // Coupled metrics: a dependent value without its parent (or with an
  // explicit "none" parent) is noise — attended-without-appointment would
  // mis-count in aggregates — so null it.
  for (const def of active) {
    if (def.config.depends_on && parentIsEmpty(def, values)) {
      values[def.key] = null;
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}
