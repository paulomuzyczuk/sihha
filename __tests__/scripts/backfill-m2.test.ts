import {
  buildEntryValues,
  entryToAggregateRow,
  legacyToAggregateRow,
  toEntry,
  LegacyCareLogRow,
} from '../../scripts/backfill-m2';
import { AGGREGATION_PERIODS } from '../../services/aggregates';
import { aggregateCareLogs } from '../../scripts/legacyAggregates';

const RECIPIENT_ID = 'recipient-uuid';

function makeLegacyRow(
  overrides: Partial<LegacyCareLogRow> = {},
): LegacyCareLogRow {
  return {
    id: 'log-1',
    user_id: 'author-uuid',
    created_at: '2026-05-21T13:57:00+00:00',
    mood_score: 2,
    medication_checklist: [
      { name: 'Olanzapine', prescribed_dosage: 2, taken: true },
      { name: 'Lithium', prescribed_dosage: 1, taken: false },
    ],
    sleep_data: { start: '22:00', end: '07:00', hours: 9 },
    exercise: { type: 'gym_session', duration_minutes: 90 },
    household_tasks: {
      fedNatasha: true,
      cleanedLitter: true,
      tookTrash: false,
      madeBed: true,
      breakfast: true,
      lunch: true,
      snack: false,
      dinner: true,
      didLaundry: null,
      cleaningLady: true,
      groceryShopping: null,
    },
    appointment: { type: 'psychiatrist', attended: false },
    notes: 'Sensitive free text',
    lat: -3.119,
    lng: -60.0217,
    location_verified: true,
    ...overrides,
  };
}

describe('buildEntryValues (legacy columns → metric-keyed values)', () => {
  it('maps camelCase task keys to snake_case metric keys, preserving nulls', () => {
    const values = buildEntryValues(makeLegacyRow());
    expect(values.fed_natasha).toBe(true);
    expect(values.took_trash).toBe(false);
    expect(values.did_laundry).toBeNull(); // not due — must stay null
    expect(values.cleaning_lady).toBe(true);
    expect(values).not.toHaveProperty('fedNatasha');
  });

  it('flattens exercise and appointment into scalar metrics', () => {
    const values = buildEntryValues(makeLegacyRow());
    expect(values.exercise_type).toBe('gym_session');
    expect(values.exercise_minutes).toBe(90);
    expect(values.appointment_type).toBe('psychiatrist');
    expect(values.appointment_attended).toBe(false);
  });

  it('stores nulls for absent exercise and appointment', () => {
    const values = buildEntryValues(
      makeLegacyRow({ exercise: null, appointment: null }),
    );
    expect(values.exercise_type).toBeNull();
    expect(values.exercise_minutes).toBeNull();
    expect(values.appointment_type).toBeNull();
    expect(values.appointment_attended).toBeNull();
  });

  it('carries mood, medications, and sleep through unchanged', () => {
    const row = makeLegacyRow();
    const values = buildEntryValues(row);
    expect(values.mood).toBe(2);
    expect(values.medications).toEqual(row.medication_checklist);
    expect(values.sleep).toEqual(row.sleep_data);
  });
});

describe('toEntry', () => {
  it('preserves the legacy id, author, timestamps, and location fields', () => {
    const row = makeLegacyRow();
    const entry = toEntry(row, RECIPIENT_ID);
    expect(entry.id).toBe(row.id);
    expect(entry.author_id).toBe(row.user_id);
    expect(entry.recipient_id).toBe(RECIPIENT_ID);
    expect(entry.log_date).toBe('2026-05-21');
    expect(entry.created_at).toBe(row.created_at);
    expect(entry.notes).toBe(row.notes);
    expect(entry.lat).toBe(row.lat);
    expect(entry.location_verified).toBe(true);
  });

  it('derives log_date in UTC', () => {
    const entry = toEntry(
      makeLegacyRow({ created_at: '2026-05-21T23:30:00-04:00' }), // 03:30 UTC next day
      RECIPIENT_ID,
    );
    expect(entry.log_date).toBe('2026-05-22');
  });
});

describe('round-trip parity (the M2 invariant)', () => {
  it('a transformed entry aggregates identically to its legacy row, all periods', () => {
    const rows = [
      makeLegacyRow(),
      makeLegacyRow({
        id: 'log-2',
        created_at: '2026-05-22T14:00:00+00:00',
        mood_score: 4,
        exercise: null,
        appointment: null,
        medication_checklist: [],
        lat: null,
        lng: null,
        location_verified: false,
        notes: null,
      }),
      makeLegacyRow({
        id: 'log-3',
        created_at: '2026-06-02T10:00:00+00:00',
        appointment: { type: 'psychologist', attended: true },
      }),
    ];
    const entries = rows.map((row) => toEntry(row, RECIPIENT_ID));

    for (const period of AGGREGATION_PERIODS) {
      const fromLegacy = aggregateCareLogs(
        rows.map(legacyToAggregateRow),
        period,
      );
      const fromEntries = aggregateCareLogs(
        entries.map(entryToAggregateRow),
        period,
      );
      expect(fromEntries).toEqual(fromLegacy);
    }
  });
});
