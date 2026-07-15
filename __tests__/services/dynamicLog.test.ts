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
    cadence_days: null,
    cadence_start: null,
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
  // 2026-07-07 is a Tuesday (weekdayMon0 = 1)
  const TUE = '2026-07-07';

  it('daily metrics are always due', () => {
    expect(
      isDueToday(
        {
          cadence: 'daily',
          cadence_day: null,
          cadence_days: null,
          cadence_start: null,
        },
        3,
        TUE,
      ),
    ).toBe(true);
  });

  it('weekly metrics are due only on their configured day', () => {
    expect(
      isDueToday(
        {
          cadence: 'weekly',
          cadence_day: 1,
          cadence_days: null,
          cadence_start: null,
        },
        1,
        TUE,
      ),
    ).toBe(true);
    expect(
      isDueToday(
        {
          cadence: 'weekly',
          cadence_day: 1,
          cadence_days: null,
          cadence_start: null,
        },
        2,
        TUE,
      ),
    ).toBe(false);
  });

  it('custom weekly derives its weekday from the start date', () => {
    // 2026-06-30 is also a Tuesday
    const def = {
      cadence: 'weekly' as const,
      cadence_day: null,
      cadence_days: null,
      cadence_start: '2026-06-30',
    };
    expect(isDueToday(def, 1, TUE)).toBe(true);
    expect(isDueToday(def, 2, '2026-07-08')).toBe(false);
  });

  it('weekly metrics with a day set are due on each listed day', () => {
    // Mon, Tue, Thu, Fri — the diarista's schedule
    const def = {
      cadence: 'weekly' as const,
      cadence_day: null,
      cadence_days: [0, 1, 3, 4],
      cadence_start: null,
    };
    expect(isDueToday(def, 0, '2026-07-06')).toBe(true);
    expect(isDueToday(def, 1, TUE)).toBe(true);
    expect(isDueToday(def, 2, '2026-07-08')).toBe(false); // Wednesday
    expect(isDueToday(def, 3, '2026-07-09')).toBe(true);
    expect(isDueToday(def, 4, '2026-07-10')).toBe(true);
    expect(isDueToday(def, 5, '2026-07-11')).toBe(false);
  });

  it('nothing custom is due before its start date', () => {
    expect(
      isDueToday(
        {
          cadence: 'weekly',
          cadence_day: 1,
          cadence_days: null,
          cadence_start: '2026-08-01',
        },
        1,
        TUE,
      ),
    ).toBe(false);
    expect(
      isDueToday(
        {
          cadence: 'monthly',
          cadence_day: null,
          cadence_days: null,
          cadence_start: '2026-08-15',
        },
        1,
        TUE,
      ),
    ).toBe(false);
  });

  it('monthly metrics repeat on the start day-of-month', () => {
    const def = {
      cadence: 'monthly' as const,
      cadence_day: null,
      cadence_days: null,
      cadence_start: '2026-05-07',
    };
    expect(isDueToday(def, 1, TUE)).toBe(true); // 07 July
    expect(isDueToday(def, 2, '2026-07-08')).toBe(false);
  });

  it('monthly on day 31 clamps to shorter months', () => {
    const def = {
      cadence: 'monthly' as const,
      cadence_day: null,
      cadence_days: null,
      cadence_start: '2026-01-31',
    };
    expect(isDueToday(def, 5, '2026-02-28')).toBe(true); // Feb has no 31st
    expect(isDueToday(def, 1, '2026-03-31')).toBe(true);
    expect(isDueToday(def, 0, '2026-03-30')).toBe(false);
  });

  it('quarterly metrics repeat every third month from the start', () => {
    const def = {
      cadence: 'quarterly' as const,
      cadence_day: null,
      cadence_days: null,
      cadence_start: '2026-01-07',
    };
    expect(isDueToday(def, 2, '2026-04-07')).toBe(true);
    expect(isDueToday(def, 1, TUE)).toBe(true); // July = +6 months
    expect(isDueToday(def, 4, '2026-08-07')).toBe(false); // +7 months
  });
});

describe('validateValues', () => {
  const WEEKDAY = 1; // Tuesday
  const TODAY = '2026-07-07'; // a Tuesday

  it('rejects non-object payloads and unknown keys', () => {
    expect(validateValues([], WEEKDAY, TODAY, 'nope').ok).toBe(false);
    const result = validateValues(
      [def({ key: 'mood', value_type: 'scale' })],
      WEEKDAY,
      TODAY,
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
    expect(validateValues(defs, WEEKDAY, TODAY, {}).ok).toBe(false);
    expect(validateValues(defs, WEEKDAY, TODAY, { mood: 6 }).ok).toBe(false);
    const ok = validateValues(defs, WEEKDAY, TODAY, { mood: 4 });
    expect(ok).toEqual({ ok: true, values: { mood: 4 } });
  });

  it('forces not-due weekly metrics to null and rejects provided values', () => {
    const defs = [
      def({ key: 'did_laundry', cadence: 'weekly', cadence_day: 3 }),
    ];
    const ok = validateValues(defs, WEEKDAY, TODAY, {});
    expect(ok).toEqual({ ok: true, values: { did_laundry: null } });
    expect(validateValues(defs, WEEKDAY, TODAY, { did_laundry: true }).ok).toBe(
      false,
    );
  });

  it('accepts due weekly metrics on their day', () => {
    const defs = [
      def({ key: 'did_laundry', cadence: 'weekly', cadence_day: WEEKDAY }),
    ];
    const result = validateValues(defs, WEEKDAY, TODAY, { did_laundry: true });
    expect(result).toEqual({ ok: true, values: { did_laundry: true } });
  });

  it('computes hours for time_range values (incl. midnight crossing)', () => {
    const defs = [def({ key: 'sleep', value_type: 'time_range' })];
    const result = validateValues(defs, WEEKDAY, TODAY, {
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
    expect(
      validateValues(defs, WEEKDAY, TODAY, { exercise_type: 'walking' }).ok,
    ).toBe(true);
    expect(
      validateValues(defs, WEEKDAY, TODAY, { exercise_type: 'flying' }).ok,
    ).toBe(false);
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
    expect(
      validateValues(defs, WEEKDAY, TODAY, { exercise_minutes: 45 }).ok,
    ).toBe(false);
    const ok = validateValues(defs, WEEKDAY, TODAY, {
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
    const result = validateValues(defs, WEEKDAY, TODAY, {
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
    const result = validateValues(defs, WEEKDAY, TODAY, {
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

  it('exempts required dependents while their parent is empty or "none"', () => {
    const defs = [
      def({
        key: 'appointment_type',
        value_type: 'enum',
        required: true,
        config: {
          options: [
            { value: 'none', label: 'Sem consulta hoje' },
            { value: 'psychologist', label: 'Psicólogo(a)' },
          ],
        },
      }),
      def({
        key: 'appointment_attended',
        value_type: 'boolean',
        required: true,
        config: { depends_on: 'appointment_type' },
      }),
    ];
    // Explicit "none" answers the parent and releases the dependent
    expect(
      validateValues(defs, WEEKDAY, TODAY, { appointment_type: 'none' }),
    ).toEqual({
      ok: true,
      values: { appointment_type: 'none', appointment_attended: null },
    });
    // A real appointment makes the dependent answer mandatory
    const missing = validateValues(defs, WEEKDAY, TODAY, {
      appointment_type: 'psychologist',
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues[0]).toContain('appointment_attended');
    }
  });

  it('reveals depends_value dependents only on the trigger answer', () => {
    const defs = [
      def({
        key: 'appointment_type',
        value_type: 'enum',
        required: true,
        config: {
          options: [
            { value: 'psychologist', label: 'Psicólogo(a)' },
            { value: 'other', label: 'Outra (especifique abaixo)' },
          ],
        },
      }),
      def({
        key: 'appointment_other',
        value_type: 'text',
        required: true,
        config: { depends_on: 'appointment_type', depends_value: 'other' },
      }),
    ];
    // A named type does not require (or keep) the free-text answer
    expect(
      validateValues(defs, WEEKDAY, TODAY, {
        appointment_type: 'psychologist',
        appointment_other: 'stray text',
      }),
    ).toEqual({
      ok: true,
      values: { appointment_type: 'psychologist', appointment_other: null },
    });
    // "Other" demands the specification…
    expect(
      validateValues(defs, WEEKDAY, TODAY, { appointment_type: 'other' }).ok,
    ).toBe(false);
    // …and accepts it
    expect(
      validateValues(defs, WEEKDAY, TODAY, {
        appointment_type: 'other',
        appointment_other: 'Cardiologista',
      }),
    ).toEqual({
      ok: true,
      values: {
        appointment_type: 'other',
        appointment_other: 'Cardiologista',
      },
    });
  });

  it('ignores inactive definitions entirely', () => {
    const defs = [def({ key: 'retired', active: false })];
    expect(validateValues(defs, WEEKDAY, TODAY, { retired: true }).ok).toBe(
      false,
    ); // unknown key
    expect(validateValues(defs, WEEKDAY, TODAY, {})).toEqual({
      ok: true,
      values: {},
    });
  });
});
