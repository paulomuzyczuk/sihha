import { NextRequest } from 'next/server';
import { GET as getMetadata } from '../../../app/api/fhir/metadata/route';
import { GET as searchPatients } from '../../../app/api/fhir/Patient/route';
import { GET as readPatient } from '../../../app/api/fhir/Patient/[id]/route';
import { GET as searchObservations } from '../../../app/api/fhir/Observation/route';
import { GET as searchMedications } from '../../../app/api/fhir/MedicationStatement/route';
import { GET as searchCareTeam } from '../../../app/api/fhir/CareTeam/route';
import { GET as everything } from '../../../app/api/fhir/Patient/[id]/$everything/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import {
  chain,
  membershipRows,
  RECIPIENT_ROW,
} from '../../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const METRIC_DEFS = [
  {
    key: 'mood',
    label: 'Humor',
    value_type: 'scale',
    config: { min: 1, max: 5 },
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: true,
    sort_order: 0,
    active: true,
  },
  {
    key: 'medications',
    label: 'Medicações',
    value_type: 'medication_checklist',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: true,
    sort_order: 1,
    active: true,
  },
];

const ENTRIES = [
  {
    id: 'entry-1',
    log_date: '2026-07-01',
    created_at: '2026-07-01T22:00:00.000Z',
    values: {
      mood: 4,
      medications: [{ name: 'Olanzapine', prescribed_dosage: 2, taken: true }],
      notes: 'sensitive free text',
    },
  },
  {
    id: 'entry-2',
    log_date: '2026-07-02',
    created_at: '2026-07-02T21:30:00.000Z',
    values: {
      mood: 2,
      medications: [{ name: 'Olanzapine', prescribed_dosage: 2, taken: false }],
    },
  },
];

function fhirRequest(
  path: string,
  params: Record<string, string | string[]> = {},
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL(`http://localhost/api/fhir/${path}`);
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, v);
    }
  }
  return new NextRequest(url, { method: 'GET', headers });
}

function mockRole(role: 'owner' | 'caregiver' | 'clinician' | 'recipient') {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({ data: membershipRows(role) });
}

const idContext = { params: Promise.resolve({ id: 'recipient-1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
  adminTables['metric_definitions'] = chain({ data: METRIC_DEFS });
  adminTables['care_log_entries'] = chain({ data: ENTRIES });
});

describe('GET /api/fhir/metadata', () => {
  it('serves the CapabilityStatement without authentication', async () => {
    const res = await getMetadata(fhirRequest('metadata', {}, null));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/fhir+json; charset=utf-8',
    );
    const body = await res.json();
    expect(body.resourceType).toBe('CapabilityStatement');
    expect(body.fhirVersion).toBe('4.0.1');
    expect(body.rest[0].resource.map((r: { type: string }) => r.type)).toEqual([
      'Patient',
      'Observation',
      'MedicationStatement',
      'CareTeam',
    ]);
  });
});

describe('FHIR authorization (owner-gated raw export)', () => {
  it('returns 401 OperationOutcome without a token', async () => {
    const res = await readPatient(
      fhirRequest('Patient/recipient-1', {}, null),
      idContext,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].code).toBe('login');
  });

  it('keeps every non-owner role out — clinicians stay aggregates-only', async () => {
    for (const role of ['caregiver', 'clinician', 'recipient'] as const) {
      resetRateLimiter();
      mockRole(role);
      const res = await searchObservations(
        fhirRequest('Observation', { patient: 'recipient-1' }),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).resourceType).toBe('OperationOutcome');
    }
  });
});

describe('GET /api/fhir/Patient and /Patient/{id}', () => {
  it('reads a Patient as the circle owner', async () => {
    mockRole('owner');
    const res = await readPatient(
      fhirRequest('Patient/recipient-1'),
      idContext,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      resourceType: 'Patient',
      id: 'recipient-1',
      active: true,
      name: [{ text: RECIPIENT_ROW.display_name }],
    });
  });

  it('searches the caller-owned patients as a Bundle', async () => {
    mockRole('owner');
    const res = await searchPatients(fhirRequest('Patient'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBe(1);
    expect(body.entry[0].resource.resourceType).toBe('Patient');
  });
});

describe('GET /api/fhir/Observation', () => {
  it('requires the patient parameter', async () => {
    mockRole('owner');
    const res = await searchObservations(fhirRequest('Observation'));
    expect(res.status).toBe(400);
    expect((await res.json()).issue[0].code).toBe('invalid');
  });

  it('accepts the Patient/<id> reference form', async () => {
    mockRole('owner');
    const res = await searchObservations(
      fhirRequest('Observation', { patient: 'Patient/recipient-1' }),
    );
    expect(res.status).toBe(200);
  });

  it('returns one Observation per defined metric value, never notes', async () => {
    mockRole('owner');
    const res = await searchObservations(
      fhirRequest('Observation', { patient: 'recipient-1' }),
    );
    const body = await res.json();
    expect(body.total).toBe(2); // mood × 2 entries; checklist excluded here
    const [first] = body.entry;
    expect(first.resource).toMatchObject({
      resourceType: 'Observation',
      id: 'entry-1.mood',
      status: 'final',
      valueInteger: 4,
      effectiveDateTime: '2026-07-01',
    });
    expect(JSON.stringify(body)).not.toContain('sensitive free text');
  });

  it('pages with _count/_offset and links the next page', async () => {
    mockRole('owner');
    const res = await searchObservations(
      fhirRequest('Observation', { patient: 'recipient-1', _count: '1' }),
    );
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.entry).toHaveLength(1);
    const next = body.link.find(
      (l: { relation: string }) => l.relation === 'next',
    );
    expect(next.url).toContain('_offset=1');
  });

  it('rejects malformed date parameters', async () => {
    mockRole('owner');
    const res = await searchObservations(
      fhirRequest('Observation', {
        patient: 'recipient-1',
        date: 'gtlast-week',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/fhir/MedicationStatement', () => {
  it('maps checklist items to completed / not-taken statements', async () => {
    mockRole('owner');
    const res = await searchMedications(
      fhirRequest('MedicationStatement', { patient: 'recipient-1' }),
    );
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.entry[0].resource).toMatchObject({
      resourceType: 'MedicationStatement',
      status: 'completed',
      medicationCodeableConcept: { text: 'Olanzapine' },
    });
    expect(body.entry[1].resource.status).toBe('not-taken');
  });
});

describe('GET /api/fhir/CareTeam', () => {
  it('returns the circle as one CareTeam with labels only', async () => {
    mockRole('owner');
    adminTables['care_team_members'] = chain({
      data: [
        ...membershipRows('owner'),
        { role: 'caregiver', member_label: 'Terapeuta' },
      ],
    });
    const res = await searchCareTeam(
      fhirRequest('CareTeam', { patient: 'recipient-1' }),
    );
    const body = await res.json();
    expect(body.total).toBe(1);
    const team = body.entry[0].resource;
    expect(team.resourceType).toBe('CareTeam');
    expect(team.participant).toHaveLength(2);
    expect(JSON.stringify(team)).not.toContain('user-1');
  });
});

describe('GET /api/fhir/Patient/{id}/$everything', () => {
  it('bundles Patient, CareTeam, Observations and MedicationStatements', async () => {
    mockRole('owner');
    const res = await everything(
      fhirRequest('Patient/recipient-1/$everything'),
      idContext,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resourceType).toBe('Bundle');
    const types = body.entry.map(
      (e: { resource: { resourceType: string } }) => e.resource.resourceType,
    );
    expect(types.filter((t: string) => t === 'Patient')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'CareTeam')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'Observation')).toHaveLength(2);
    expect(
      types.filter((t: string) => t === 'MedicationStatement'),
    ).toHaveLength(2);
    expect(body.total).toBe(6);
    expect(JSON.stringify(body)).not.toContain('sensitive free text');
  });
});
