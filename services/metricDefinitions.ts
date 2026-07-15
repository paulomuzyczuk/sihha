import { z } from 'zod';

// Owner-facing metric_definitions CRUD validation (M4, design §5.4). The
// hard rule lives in the PATCH route: a metric's value_type freezes once log
// entries reference its key (decision #4) — historical values are read
// through the current definition, so a type change would corrupt them.
// Everything here is the soft layer: field shapes and per-type coherence.

export const METRIC_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

export const METRIC_VALUE_TYPES = [
  'scale',
  'boolean',
  'number',
  'duration_minutes',
  'time_range',
  'enum',
  'medication_checklist',
  'text',
] as const;

// daily needs nothing; weekly takes cadence_day (legacy) or derives it from
// cadence_start; monthly/quarterly always anchor to cadence_start.
export const METRIC_CADENCES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The cadence/cadence_day(s)/cadence_start coherence rule, or null when ok. */
export function cadenceIssue(m: {
  cadence: (typeof METRIC_CADENCES)[number];
  cadence_day?: number | null;
  cadence_days?: number[] | null;
  cadence_start?: string | null;
}): string | null {
  if (
    m.cadence === 'weekly' &&
    typeof m.cadence_day !== 'number' &&
    !m.cadence_days?.length &&
    !m.cadence_start
  ) {
    return 'weekly metrics need cadence_day (0-6), cadence_days or cadence_start';
  }
  if (
    (m.cadence === 'monthly' || m.cadence === 'quarterly') &&
    !m.cadence_start
  ) {
    return `${m.cadence} metrics need cadence_start (YYYY-MM-DD)`;
  }
  return null;
}

const ConfigSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().min(1).max(20).optional(),
    options: z
      .array(
        z.union([
          z.number(),
          z.object({
            value: z.string().min(1).max(100),
            label: z.string().min(1).max(200),
          }),
        ]),
      )
      .max(50)
      .optional(),
    depends_on: z.string().regex(METRIC_KEY_RE).optional(),
    depends_value: z.string().min(1).max(100).optional(),
    anchors: z.record(z.string().min(1).max(60)).optional(),
  })
  .strict();

export type MetricConfigInput = z.infer<typeof ConfigSchema>;

export const MetricCreateSchema = z
  .object({
    key: z.string().regex(METRIC_KEY_RE),
    label: z.string().min(1).max(200),
    short_label: z.string().min(1).max(60).nullable().optional(),
    value_type: z.enum(METRIC_VALUE_TYPES),
    config: ConfigSchema.default({}),
    cadence: z.enum(METRIC_CADENCES).default('daily'),
    cadence_day: z.number().int().min(0).max(6).nullable().optional(),
    cadence_days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .nullable()
      .optional(),
    cadence_start: z.string().regex(DATE_RE).nullable().optional(),
    section: z.string().min(1).max(120).nullable().optional(),
    subsection: z.string().min(1).max(120).nullable().optional(),
    filled_by: z
      .enum(['owner', 'caregiver', 'clinician', 'recipient'])
      .default('caregiver'),
    clinician_profile: z
      .enum(['psychologist', 'psychiatrist'])
      .nullable()
      .optional(),
    required: z.boolean().default(false),
  })
  .refine((m) => cadenceIssue(m) === null, {
    message: 'custom cadences need a valid cadence_day/cadence_start',
  })
  .refine((m) => m.clinician_profile == null || m.filled_by === 'clinician', {
    message: 'clinician_profile requires filled_by=clinician',
  });

export const MetricUpdateSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    short_label: z.string().min(1).max(60).nullable().optional(),
    value_type: z.enum(METRIC_VALUE_TYPES).optional(),
    config: ConfigSchema.optional(),
    cadence: z.enum(METRIC_CADENCES).optional(),
    cadence_day: z.number().int().min(0).max(6).nullable().optional(),
    cadence_days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .nullable()
      .optional(),
    cadence_start: z.string().regex(DATE_RE).nullable().optional(),
    section: z.string().min(1).max(120).nullable().optional(),
    subsection: z.string().min(1).max(120).nullable().optional(),
    filled_by: z
      .enum(['owner', 'caregiver', 'clinician', 'recipient'])
      .optional(),
    clinician_profile: z
      .enum(['psychologist', 'psychiatrist'])
      .nullable()
      .optional(),
    required: z.boolean().optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'empty update',
  });

/**
 * Per-type coherence the field shapes cannot express. Returns the problem or
 * null when the pair is coherent.
 */
export function configIssueForType(
  valueType: (typeof METRIC_VALUE_TYPES)[number],
  config: MetricConfigInput,
): string | null {
  if (
    config.min !== undefined &&
    config.max !== undefined &&
    config.min >= config.max
  ) {
    return 'config.min must be below config.max';
  }
  if (valueType === 'enum') {
    const named = (config.options ?? []).filter(
      (option) => typeof option === 'object',
    );
    if (named.length < 2) {
      return 'enum metrics need at least two {value, label} options';
    }
  }
  if (valueType === 'duration_minutes') {
    const bad = (config.options ?? []).some(
      (option) => typeof option !== 'number',
    );
    if (bad) return 'duration_minutes options must be numbers';
  }
  return null;
}
