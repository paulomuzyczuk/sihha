import { z } from 'zod';

// Dynamic validation for care_log_entries.values: the schema is BUILT from
// the recipient's metric_definitions at request time — the platform's core
// "schema as data" move. Each value_type maps to one Zod validator; weekly
// metrics that are not due on the recipient-local day must be null (the same
// semantics the legacy weekly household tasks had).

export interface MetricDefinitionRow {
  key: string;
  label: string;
  value_type:
    | 'scale'
    | 'boolean'
    | 'number'
    | 'duration_minutes'
    | 'time_range'
    | 'enum'
    | 'medication_checklist';
  config: {
    min?: number;
    max?: number;
    options?: Array<number | { value: string; label: string }>;
    depends_on?: string;
  };
  cadence: 'daily' | 'weekly';
  cadence_day: number | null;
  filled_by: string;
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

export function isDueToday(
  def: Pick<MetricDefinitionRow, 'cadence' | 'cadence_day'>,
  weekdayMon0: number,
): boolean {
  return def.cadence === 'daily' || def.cadence_day === weekdayMon0;
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
  }
}

export type ValuesValidation =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; issues: string[] };

/**
 * Validates a raw values object against the recipient's active metric
 * definitions for the given recipient-local weekday. Unknown keys are
 * rejected; not-due weekly metrics are forced to null; metrics whose
 * depends_on parent is null are coerced to null (e.g. exercise_minutes
 * without exercise_type).
 */
export function validateValues(
  definitions: MetricDefinitionRow[],
  weekdayMon0: number,
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

    if (!isDueToday(def, weekdayMon0)) {
      if (provided != null) {
        issues.push(`${def.key}: not due today, must be null`);
      }
      values[def.key] = null;
      continue;
    }

    if (provided == null) {
      if (def.required) {
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

  // Coupled optional metrics: a dependent value without its parent is noise
  // (attended-without-appointment would mis-count in aggregates) — null it.
  for (const def of active) {
    const parent = def.config.depends_on;
    if (parent && values[parent] == null) {
      values[def.key] = null;
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}
