import type { MetricDefinitionRow } from '../../services/dynamicLog';
import {
  ENUM_VALUE_SYSTEM,
  METRIC_CODE_SYSTEM,
  observationId,
  operationOutcome,
  toCareTeam,
  toMedicationStatements,
  toObservations,
  toPatient,
  toSearchsetBundle,
} from '../../services/fhir';

const RECIPIENT_ID = 'recipient-1';

function def(partial: Partial<MetricDefinitionRow>): MetricDefinitionRow {
  return {
    key: 'metric',
    label: 'Metric',
    value_type: 'boolean',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    active: true,
    ...partial,
  };
}

const DEFS: MetricDefinitionRow[] = [
  def({
    key: 'mood',
    label: 'Humor',
    value_type: 'scale',
    config: { min: 1, max: 5 },
  }),
  def({
    key: 'weight',
    label: 'Peso',
    value_type: 'number',
    config: { unit: 'kg' } as MetricDefinitionRow['config'],
  }),
  def({ key: 'made_bed', label: 'Fez a cama', value_type: 'boolean' }),
  def({
    key: 'exercise_minutes',
    label: 'Exercício',
    value_type: 'duration_minutes',
  }),
  def({ key: 'sleep', label: 'Sono', value_type: 'time_range' }),
  def({
    key: 'exercise_type',
    label: 'Tipo de exercício',
    value_type: 'enum',
    config: { options: [{ value: 'walking', label: 'Caminhada' }] },
  }),
  def({
    key: 'medications',
    label: 'Medicações',
    value_type: 'medication_checklist',
  }),
];

const ENTRY = {
  id: 'entry-1',
  log_date: '2026-07-01',
  created_at: '2026-07-01T22:15:00.000Z',
  values: {
    mood: 4,
    weight: 71.5,
    made_bed: true,
    exercise_minutes: 30,
    sleep: { start: '22:00', end: '06:00', hours: 8 },
    exercise_type: 'walking',
    medications: [
      { name: 'Olanzapine', prescribed_dosage: 2, taken: true },
      { name: 'Sertraline', prescribed_dosage: 1, taken: false },
    ],
    // present in JSONB but not a defined metric — must never be exported
    notes: 'sensitive free text',
  },
};

describe('toPatient', () => {
  it('maps a human recipient without the animal extension', () => {
    const patient = toPatient({
      id: RECIPIENT_ID,
      display_name: 'Omar',
      kind: 'human',
      timezone: 'America/Manaus',
      log_cadence: 'one_per_day',
      geo_lat: null,
      geo_lng: null,
      geo_radius_m: null,
      active: true,
    });
    expect(patient).toEqual({
      resourceType: 'Patient',
      id: RECIPIENT_ID,
      active: true,
      name: [{ text: 'Omar' }],
    });
  });

  it('carries non-human kinds via the patient-animal extension', () => {
    const patient = toPatient({
      id: 'pet-1',
      display_name: 'Rex',
      kind: 'pet',
      timezone: 'UTC',
      log_cadence: 'one_per_day',
      geo_lat: null,
      geo_lng: null,
      geo_radius_m: null,
      active: true,
    });
    expect(patient.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/patient-animal',
        extension: [{ url: 'species', valueCodeableConcept: { text: 'pet' } }],
      },
    ]);
  });
});

describe('toCareTeam', () => {
  it('exposes roles and labels only — never user ids or e-mails', () => {
    const team = toCareTeam(RECIPIENT_ID, [
      { role: 'owner', member_label: null },
      { role: 'caregiver', member_label: 'Terapeuta' },
      { role: 'clinician', member_label: 'Psiquiatra' },
    ]);
    expect(team.id).toBe(RECIPIENT_ID);
    expect(team.subject).toEqual({ reference: `Patient/${RECIPIENT_ID}` });
    expect(team.participant).toEqual([
      { role: [{ text: 'owner' }] },
      { role: [{ text: 'caregiver' }], member: { display: 'Terapeuta' } },
      { role: [{ text: 'clinician' }], member: { display: 'Psiquiatra' } },
    ]);
    expect(JSON.stringify(team)).not.toContain('@');
    expect(JSON.stringify(team)).not.toContain('user_id');
  });
});

describe('toObservations', () => {
  const observations = toObservations(DEFS, ENTRY, RECIPIENT_ID);
  const byKey = Object.fromEntries(
    observations.map((o) => [o.code.coding![0].code, o]),
  );

  it('emits one Observation per defined non-checklist value', () => {
    expect(observations).toHaveLength(6);
  });

  it('never exports undefined values such as free-text notes', () => {
    expect(JSON.stringify(observations)).not.toContain('sensitive free text');
  });

  it('dispatches value[x] on value_type', () => {
    expect(byKey['mood'].valueInteger).toBe(4);
    expect(byKey['weight'].valueQuantity).toEqual({ value: 71.5, unit: 'kg' });
    expect(byKey['made_bed'].valueBoolean).toBe(true);
    expect(byKey['made_bed'].id).toBe('entry-1.made-bed');
    expect(byKey['exercise_minutes'].valueQuantity).toEqual({
      value: 30,
      unit: 'min',
      system: 'http://unitsofmeasure.org',
      code: 'min',
    });
    expect(byKey['sleep'].valueQuantity).toEqual({
      value: 8,
      unit: 'h',
      system: 'http://unitsofmeasure.org',
      code: 'h',
    });
    expect(byKey['exercise_type'].valueCodeableConcept).toEqual({
      coding: [
        { system: ENUM_VALUE_SYSTEM, code: 'walking', display: 'Caminhada' },
      ],
      text: 'Caminhada',
    });
  });

  it('uses the local code system with the metric label as display', () => {
    expect(byKey['mood'].code).toEqual({
      coding: [{ system: METRIC_CODE_SYSTEM, code: 'mood', display: 'Humor' }],
      text: 'Humor',
    });
  });

  it('honours a config.coding override (owner-attached LOINC)', () => {
    const loincDefs = [
      def({
        key: 'weight',
        label: 'Peso',
        value_type: 'number',
        config: {
          coding: {
            system: 'http://loinc.org',
            code: '29463-7',
            display: 'Body weight',
          },
        } as MetricDefinitionRow['config'],
      }),
    ];
    const [obs] = toObservations(loincDefs, ENTRY, RECIPIENT_ID);
    expect(obs.code.coding![0]).toEqual({
      system: 'http://loinc.org',
      code: '29463-7',
      display: 'Body weight',
    });
  });

  it('sets the clinical time to log_date and issued to the instant', () => {
    expect(byKey['mood'].effectiveDateTime).toBe('2026-07-01');
    expect(byKey['mood'].issued).toBe('2026-07-01T22:15:00.000Z');
  });

  it('meets R4 required fields (status, code, subject)', () => {
    for (const obs of observations) {
      expect(obs.status).toBe('final');
      expect(obs.code.coding!.length).toBeGreaterThan(0);
      expect(obs.subject.reference).toBe(`Patient/${RECIPIENT_ID}`);
    }
  });

  it('skips null and malformed values instead of emitting broken resources', () => {
    const malformed = {
      ...ENTRY,
      values: { mood: 'angry', weight: null, sleep: { hours: 'late' } },
    };
    expect(toObservations(DEFS, malformed, RECIPIENT_ID)).toHaveLength(0);
  });
});

describe('observationId', () => {
  it('is FHIR id-safe and bijective for snake_case keys', () => {
    expect(observationId('entry-1', 'fed_pet')).toBe('entry-1.fed-pet');
    // keys cannot contain '-', so the mapping cannot collide
    expect(observationId('entry-1', 'a_b')).not.toBe(
      observationId('entry-1', 'a__b'),
    );
    expect(observationId('entry-1', 'fed_pet')).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});

describe('toMedicationStatements', () => {
  const statements = toMedicationStatements(DEFS, ENTRY, RECIPIENT_ID);

  it('maps taken to completed and not taken to not-taken', () => {
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      resourceType: 'MedicationStatement',
      id: 'entry-1.med0',
      status: 'completed',
      medicationCodeableConcept: { text: 'Olanzapine' },
      effectiveDateTime: '2026-07-01',
      dosage: [{ text: '2 per day' }],
    });
    expect(statements[1]).toMatchObject({
      id: 'entry-1.med1',
      status: 'not-taken',
      medicationCodeableConcept: { text: 'Sertraline' },
    });
  });

  it('skips malformed checklist items', () => {
    const malformed = {
      ...ENTRY,
      values: { medications: [{ name: 42, taken: 'yes' }, 'junk'] },
    };
    expect(toMedicationStatements(DEFS, malformed, RECIPIENT_ID)).toHaveLength(
      0,
    );
  });
});

describe('bundle and outcome helpers', () => {
  it('builds a searchset with typed fullUrls', () => {
    const patient = toPatient({
      id: RECIPIENT_ID,
      display_name: 'Omar',
      kind: 'human',
      timezone: 'UTC',
      log_cadence: 'one_per_day',
      geo_lat: null,
      geo_lng: null,
      geo_radius_m: null,
      active: true,
    });
    const bundle = toSearchsetBundle([patient], 7, 'https://x.test/api/fhir');
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('searchset');
    expect(bundle.total).toBe(7);
    expect(bundle.entry![0].fullUrl).toBe(
      'https://x.test/api/fhir/Patient/recipient-1',
    );
  });

  it('shapes OperationOutcome per spec', () => {
    expect(operationOutcome('forbidden', 'nope')).toEqual({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'nope' }],
    });
  });
});
