// Care profiles (design §3.5): versioned JSON seed files, each a list of
// metric definitions + a default alert config. Creating a recipient from a
// template instantiates rows; afterwards the owner edits freely — templates
// are starting points, not live links.
//
// Statically imported (not fs-read) so Next.js bundles them into the API
// route; the committed files carry no personal data — the flagship's exact
// production config is exported separately via scripts/export-template.ts.

import mentalHealth from './mental-health.json';
import elderCare from './elder-care.json';
import petCare from './pet-care.json';

export interface TemplateMetric {
  key: string;
  label: string;
  value_type:
    | 'scale'
    | 'boolean'
    | 'number'
    | 'duration_minutes'
    | 'time_range'
    | 'enum'
    | 'medication_checklist'
    | 'text';
  config?: {
    min?: number;
    max?: number;
    unit?: string;
    options?: Array<number | { value: string; label: string }>;
    depends_on?: string;
    anchors?: Record<string, string>;
  };
  cadence?: 'daily' | 'weekly';
  cadence_day?: number;
  section?: string;
  /** Footnote at the bottom of the section's form page */
  section_note?: string;
  filled_by?: 'owner' | 'caregiver' | 'clinician' | 'recipient';
  /** Specialist scope for clinician metrics; omitted = any clinician */
  clinician_profile?: 'psychologist' | 'psychiatrist';
  required?: boolean;
}

export interface CareTemplate {
  id: string;
  name: string;
  description: string;
  kind: string;
  log_cadence: 'one_per_day' | 'multiple_per_day';
  suggests_recipient_role: boolean;
  alert_config: {
    missing_log_hour: number | null;
    low_stock_days: number | null;
  };
  metrics: TemplateMetric[];
}

// JSON imports type their literals as plain string/number, so the registry
// narrows them here; __tests__/templates.test.ts validates every file against
// the real constraints (unique keys, known value_types, resolvable
// depends_on, weekly cadence_day range).
export const CARE_TEMPLATES: CareTemplate[] = [
  mentalHealth,
  elderCare,
  petCare,
] as unknown as CareTemplate[];

export function getTemplate(id: string): CareTemplate | undefined {
  return CARE_TEMPLATES.find((template) => template.id === id);
}

/** metric_definitions rows for a recipient instantiated from a template. */
export function templateMetricRows(
  template: CareTemplate,
  recipientId: string,
): Array<Record<string, unknown>> {
  return template.metrics.map((metric, index) => ({
    recipient_id: recipientId,
    key: metric.key,
    label: metric.label,
    value_type: metric.value_type,
    config: metric.config ?? {},
    cadence: metric.cadence ?? 'daily',
    cadence_day: metric.cadence_day ?? null,
    section: metric.section ?? null,
    section_note: metric.section_note ?? null,
    filled_by: metric.filled_by ?? 'caregiver',
    clinician_profile: metric.clinician_profile ?? null,
    required: metric.required ?? false,
    sort_order: index,
  }));
}
