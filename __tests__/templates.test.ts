import { CARE_TEMPLATES, getTemplate, templateMetricRows } from '../templates';

// The template files are data, so this suite is their schema: every template
// must instantiate into rows that dynamicLog/aggregates can actually consume.

const VALUE_TYPES = [
  'scale',
  'boolean',
  'number',
  'duration_minutes',
  'time_range',
  'enum',
  'medication_checklist',
  'text',
] as const;

describe('care templates', () => {
  it('ships the three launch profiles with unique ids', () => {
    const ids = CARE_TEMPLATES.map((template) => template.id);
    expect(ids).toEqual(['mental-health', 'elder-care', 'pet-care']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CARE_TEMPLATES.map((template) => [template.id, template]))(
    '%s is internally consistent',
    (_id, template) => {
      expect(template.name.length).toBeGreaterThan(0);
      expect(['one_per_day', 'multiple_per_day']).toContain(
        template.log_cadence,
      );
      expect(template.metrics.length).toBeGreaterThan(0);

      const keys = template.metrics.map((metric) => metric.key);
      expect(new Set(keys).size).toBe(keys.length);

      for (const metric of template.metrics) {
        expect(metric.key).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(metric.label.length).toBeGreaterThan(0);
        expect(VALUE_TYPES).toContain(metric.value_type);

        // depends_on must couple to a key that exists in the same template
        const dependsOn = metric.config?.depends_on;
        if (dependsOn) expect(keys).toContain(dependsOn);

        if (metric.cadence === 'weekly') {
          expect(metric.cadence_day).toBeGreaterThanOrEqual(0);
          expect(metric.cadence_day).toBeLessThanOrEqual(6);
        }

        if (metric.value_type === 'scale') {
          expect(metric.config?.min).toBeDefined();
          expect(metric.config?.max).toBeDefined();
          expect(metric.config!.min!).toBeLessThan(metric.config!.max!);
        }

        if (metric.value_type === 'enum') {
          const options = metric.config?.options ?? [];
          expect(options.length).toBeGreaterThanOrEqual(2);
          for (const option of options) {
            expect(typeof option).toBe('object');
          }
        }

        if (metric.value_type === 'duration_minutes') {
          for (const option of metric.config?.options ?? []) {
            expect(typeof option).toBe('number');
          }
        }
      }
    },
  );

  it('getTemplate resolves by id and rejects unknown ids', () => {
    expect(getTemplate('pet-care')?.kind).toBe('pet');
    expect(getTemplate('nope')).toBeUndefined();
  });

  it('templateMetricRows produces complete rows with sequential sort_order', () => {
    const template = getTemplate('pet-care')!;
    const rows = templateMetricRows(template, 'recipient-1');
    expect(rows).toHaveLength(template.metrics.length);
    rows.forEach((row, index) => {
      expect(row).toMatchObject({
        recipient_id: 'recipient-1',
        sort_order: index,
      });
      expect(row.cadence).toBeDefined();
      expect(row.filled_by).toBeDefined();
      expect(typeof row.required).toBe('boolean');
      expect(row.config).toBeDefined();
    });
    // defaults applied where the JSON omits fields
    const fed = rows.find((row) => row.key === 'fed')!;
    expect(fed.cadence).toBe('daily');
    expect(fed.cadence_day).toBeNull();
    expect(fed.filled_by).toBe('caregiver');
    expect(fed.required).toBe(true);
  });
});
