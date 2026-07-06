import {
  isDueToday,
  localDate,
  localWeekdayMon0,
  validateValues,
  MetricDefinitionRow,
} from '../../services/dynamicLog';

function def(
  overrides: Partial<MetricDefinitionRow> & { key: string },
): MetricDefinitionRow {
  return {
    label: overrides.key,
    value_type: 'boolean',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    active: true,
    ...overrides,
  };
}

describe('localDate / localWeekdayMon0 (recipient-local calendar)', () => {
  // 2026-07-04T02:00Z = 2026-07-03 22:00 in Manaus (UTC-4)
  const lateNightUtc = new Date('2026-07-04T02:00:00Z');

  it('resolves the local calendar date across the UTC boundary', () => {
    expect(localDate('America/Manaus', lateNightUtc)).toBe('2026-07-03');
    expect(localDate('UTC', lateNightUtc)).toBe('2026-07-04');
  });

  it('resolves the local weekday with Monday = 0', () => {
    // 2026-07-03 is a Friday (4); 2026-07-04 a Saturday (5)
    expect(localWeekdayMon0('America/Manaus', lateNightUtc)).toBe(4);
    expect(localWeekdayMon0('UTC', lateNightUtc)).toBe(5);
  });
});

describe('isDueToday', () => {
  it('daily metrics are always due', () => {
    expect(isDueToday({ cadence: 'daily', cadence_day: null }, 3)).toBe(true);
  });

  it('weekly metrics are due only on their configured day', () => {
    expect(isDueToday({ cadence: 'weekly', cadence_day: 1 }, 1)).toBe(true);
    expect(isDueToday({ cadence: 'weekly', cadence_day: 1 }, 2)).toBe(false);
  });
});

describe('validateValues', () => {
  const WEEKDAY = 1; // Tuesday

  it('rejects non-object payloads and unknown keys', () => {
    expect(validateValues([], WEEKDAY, 'nope').ok).toBe(false);
    const result = validateValues(
      [def({ key: 'mood', value_type: 'scale' })],
      WEEKDAY,
      { mood: 3, hacker: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain('unknown metric keys');
  });

  it('enforces required metrics and scale bounds', () => {
    const defs = [
      def({
        key: 'mood',
        value_type: 'scale',
        config: { min: 1, max: 5 },
        required: true,
      }),
    ];
    expect(validateValues(defs, WEEKDAY, {}).ok).toBe(false);
    expect(validateValues(defs, WEEKDAY, { mood: 6 }).ok).toBe(false);
    const ok = validateValues(defs, WEEKDAY, { mood: 4 });
    expect(ok).toEqual({ ok: true, values: { mood: 4 } });
  });

  it('forces not-due weekly metrics to null and rejects provided values', () => {
    const defs = [
      def({ key: 'did_laundry', cadence: 'weekly', cadence_day: 3 }),
    ];
    const ok = validateValues(defs, WEEKDAY, {});
    expect(ok).toEqual({ ok: true, values: { did_laundry: null } });
    expect(validateValues(defs, WEEKDAY, { did_laundry: true }).ok).toBe(false);
  });

  it('accepts due weekly metrics on their day', () => {
    const defs = [
      def({ key: 'did_laundry', cadence: 'weekly', cadence_day: WEEKDAY }),
    ];
    const result = validateValues(defs, WEEKDAY, { did_laundry: true });
    expect(result).toEqual({ ok: true, values: { did_laundry: true } });
  });

  it('computes hours for time_range values (incl. midnight crossing)', () => {
    const defs = [def({ key: 'sleep', value_type: 'time_range' })];
    const result = validateValues(defs, WEEKDAY, {
      sleep: { start: '22:00', end: '07:00' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.sleep).toEqual({
        start: '22:00',
        end: '07:00',
        hours: 9,
      });
    }
  });

  it('validates enum values against configured options', () => {
    const defs = [
      def({
        key: 'exercise_type',
        value_type: 'enum',
        config: { options: [{ value: 'walking', label: 'Caminhada' }] },
      }),
    ];
    expect(validateValues(defs, WEEKDAY, { exercise_type: 'walking' }).ok).toBe(
      true,
    );
    expect(validateValues(defs, WEEKDAY, { exercise_type: 'flying' }).ok).toBe(
      false,
    );
  });

  it('validates duration options and medication checklist items', () => {
    const defs = [
      def({
        key: 'exercise_minutes',
        value_type: 'duration_minutes',
        config: { options: [15, 30] },
      }),
      def({ key: 'medications', value_type: 'medication_checklist' }),
    ];
    expect(validateValues(defs, WEEKDAY, { exercise_minutes: 45 }).ok).toBe(
      false,
    );
    const ok = validateValues(defs, WEEKDAY, {
      exercise_minutes: 30,
      medications: [{ name: 'Olanzapine', prescribed_dosage: 2, taken: true }],
    });
    expect(ok.ok).toBe(true);
  });

  it('nulls dependents whose parent is null (coupled metrics)', () => {
    const defs = [
      def({
        key: 'appointment_type',
        value_type: 'enum',
        config: { options: [{ value: 'psychologist', label: 'Psicólogo' }] },
      }),
      def({
        key: 'appointment_attended',
        value_type: 'boolean',
        config: { depends_on: 'appointment_type' },
      }),
    ];
    const result = validateValues(defs, WEEKDAY, {
      appointment_attended: true, // no appointment_type — must not survive
    });
    expect(result).toEqual({
      ok: true,
      values: { appointment_type: null, appointment_attended: null },
    });
  });

  it('keeps dependents whose parent has a value', () => {
    const defs = [
      def({
        key: 'appointment_type',
        value_type: 'enum',
        config: { options: [{ value: 'psychologist', label: 'Psicólogo' }] },
      }),
      def({
        key: 'appointment_attended',
        value_type: 'boolean',
        config: { depends_on: 'appointment_type' },
      }),
    ];
    const result = validateValues(defs, WEEKDAY, {
      appointment_type: 'psychologist',
      appointment_attended: false,
    });
    expect(result).toEqual({
      ok: true,
      values: {
        appointment_type: 'psychologist',
        appointment_attended: false,
      },
    });
  });

  it('ignores inactive definitions entirely', () => {
    const defs = [def({ key: 'retired', active: false })];
    expect(validateValues(defs, WEEKDAY, { retired: true }).ok).toBe(false); // unknown key
    expect(validateValues(defs, WEEKDAY, {})).toEqual({
      ok: true,
      values: {},
    });
  });
});
