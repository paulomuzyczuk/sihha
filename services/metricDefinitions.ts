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
] as const;

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
  })
  .strict();

export type MetricConfigInput = z.infer<typeof ConfigSchema>;

export const MetricCreateSchema = z
  .object({
    key: z.string().regex(METRIC_KEY_RE),
    label: z.string().min(1).max(200),
    value_type: z.enum(METRIC_VALUE_TYPES),
    config: ConfigSchema.default({}),
    cadence: z.enum(['daily', 'weekly']).default('daily'),
    cadence_day: z.number().int().min(0).max(6).nullable().optional(),
    filled_by: z
      .enum(['owner', 'caregiver', 'clinician', 'recipient'])
      .default('caregiver'),
    required: z.boolean().default(false),
  })
  .refine((m) => m.cadence !== 'weekly' || typeof m.cadence_day === 'number', {
    message: 'weekly metrics need cadence_day (0-6)',
  });

export const MetricUpdateSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    value_type: z.enum(METRIC_VALUE_TYPES).optional(),
    config: ConfigSchema.optional(),
    cadence: z.enum(['daily', 'weekly']).optional(),
    cadence_day: z.number().int().min(0).max(6).nullable().optional(),
    filled_by: z
      .enum(['owner', 'caregiver', 'clinician', 'recipient'])
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
