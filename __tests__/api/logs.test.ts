import { POST } from '../../app/api/logs/route';
import { NextRequest } from 'next/server';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

const mockGetUser = jest.fn();
const mockUserInsert = jest.fn();

// Token verification builds a user-scoped client via createClient; the same
// client performs the RLS-enforced insert.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
    from: jest.fn().mockImplementation(() => ({ insert: mockUserInsert })),
  })),
}));

// Per-table admin-client results, configurable per test
const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const mockStockCheck = jest.fn();
jest.mock('../../services/stockAlert', () => ({
  checkAndAlertLowStock: (...args: unknown[]) => mockStockCheck(...args),
}));

// The seeded flagship definitions, minimally
const DEFINITIONS = [
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
    key: 'sleep',
    label: 'Sono',
    value_type: 'time_range',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: true,
    sort_order: 1,
    active: true,
  },
  {
    key: 'fed_pet',
    label: 'Alimentou o pet',
    value_type: 'boolean',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 2,
    active: true,
  },
];

const validValues = {
  mood: 4,
  sleep: { start: '22:00', end: '07:00' },
  fed_pet: true,
};

function makeRequest(body: unknown, token: string | null = 'valid-token') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/logs', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function mockCaregiver(recipient = RECIPIENT_ROW) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'caregiver-1', email: 'c@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({
    data: membershipRows('caregiver', recipient),
  });
  adminTables['metric_definitions'] = chain({ data: DEFINITIONS });
  adminTables['care_log_entries'] = chain({ count: 0 });
  mockUserInsert.mockResolvedValue({ error: null });
  mockStockCheck.mockResolvedValue(undefined);
}

describe('POST /api/logs (M3: dynamic, membership-scoped)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 without a token', async () => {
    const res = await POST(makeRequest({ values: validValues }, null));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user has no membership', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'stranger' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({ data: [] });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for an owner (no metrics to fill)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('owner'),
    });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(403);
  });

  it("rejects another role's metric keys (M6: role-scoped entries)", async () => {
    // A clinician may submit, but caregiver metrics are unknown keys to them
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'clinician-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('clinician'),
    });
    adminTables['metric_definitions'] = chain({ data: DEFINITIONS });
    adminTables['care_log_entries'] = chain({ count: 0 });
    mockUserInsert.mockResolvedValue({ error: null });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(400);
  });

  it('accepts a role-scoped entry and stamps author_role (M6)', async () => {
    // The recipient submits his own self-report scale only
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'recipient-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('recipient'),
    });
    adminTables['metric_definitions'] = chain({
      data: [
        ...DEFINITIONS,
        {
          key: 'who5_cheerful',
          label: 'Me senti alegre e de bom humor',
          value_type: 'scale',
          config: { min: 0, max: 5 },
          cadence: 'daily',
          cadence_day: null,
          filled_by: 'recipient',
          required: false,
          sort_order: 21,
          active: true,
        },
      ],
    });
    adminTables['care_log_entries'] = chain({ count: 0 });
    mockUserInsert.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ values: { who5_cheerful: 4 } }));
    expect(res.status).toBe(200);
    expect(mockUserInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_role: 'recipient',
        values: { who5_cheerful: 4 },
      }),
    );
    // Meds live in caregiver metrics — no stock check for other roles
    expect(mockStockCheck).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed envelope', async () => {
    mockCaregiver();
    const res = await POST(makeRequest({ notValues: true }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when a required metric is missing', async () => {
    mockCaregiver();
    const res = await POST(
      makeRequest({ values: { sleep: { start: '22:00', end: '07:00' } } }),
    );
    expect(res.status).toBe(400);
    expect(mockUserInsert).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown metric keys', async () => {
    mockCaregiver();
    const res = await POST(
      makeRequest({ values: { ...validValues, injected: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it("overwrites the day's earlier entry and snapshots a revision", async () => {
    mockCaregiver();
    adminTables['care_log_entries'] = chain({
      data: {
        id: 'entry-1',
        values: { mood: 2 },
        notes: 'primeira resposta',
        author_id: 'caregiver-0',
        created_at: '2026-07-13T10:00:00.000Z',
      },
    });
    adminTables['care_log_revisions'] = chain({ data: [] });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(200);
    expect((await res.json()).overwrote).toBe(true);
    // The replaced answer lands in the audit table first…
    expect(adminTables['care_log_revisions'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_id: 'entry-1',
        replaced_values: { mood: 2 },
        replaced_notes: 'primeira resposta',
        replaced_author_id: 'caregiver-0',
        overwritten_by: 'caregiver-1',
      }),
    );
    // …then the update replaces the row in place — nothing is inserted
    expect(mockUserInsert).not.toHaveBeenCalled();
    expect(adminTables['care_log_entries'].update).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: 'caregiver-1',
        values: expect.objectContaining({ mood: 4 }),
      }),
    );
  });

  it('accepts a valid submission, computing sleep hours server-side', async () => {
    mockCaregiver();
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();

    const inserted = mockUserInsert.mock.calls[0][0];
    expect(inserted.recipient_id).toBe(RECIPIENT_ROW.id);
    expect(inserted.author_id).toBe('caregiver-1');
    expect(inserted.values.sleep).toEqual({
      start: '22:00',
      end: '07:00',
      hours: 9,
    });
    expect(inserted.values.mood).toBe(4);
  });

  it('verifies location against the recipient geofence', async () => {
    mockCaregiver();
    const res = await POST(
      makeRequest({
        values: validValues,
        location: { lat: RECIPIENT_ROW.geo_lat, lng: RECIPIENT_ROW.geo_lng },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUserInsert.mock.calls[0][0].location_verified).toBe(true);
  });

  it('marks location unverified when outside the geofence or absent', async () => {
    mockCaregiver();
    await POST(
      makeRequest({
        values: validValues,
        location: { lat: 0, lng: 0 },
      }),
    );
    expect(mockUserInsert.mock.calls[0][0].location_verified).toBe(false);

    adminTables['care_log_entries'] = chain({ count: 0 });
    await POST(makeRequest({ values: validValues }));
    expect(mockUserInsert.mock.calls[1][0].location_verified).toBe(false);
  });

  it('never verifies when the recipient has no geofence configured', async () => {
    mockCaregiver({
      ...RECIPIENT_ROW,
      geo_lat: null,
      geo_lng: null,
      geo_radius_m: null,
    });
    const res = await POST(
      makeRequest({
        values: validValues,
        location: { lat: -3.119, lng: -60.0217 },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUserInsert.mock.calls[0][0].location_verified).toBe(false);
  });

  it('runs the low-stock check for the recipient after inserting', async () => {
    mockCaregiver();
    await POST(makeRequest({ values: validValues }));
    expect(mockStockCheck).toHaveBeenCalledWith(
      expect.anything(),
      RECIPIENT_ROW.id,
    );
  });

  it('allows multiple_per_day recipients to submit twice', async () => {
    mockCaregiver({ ...RECIPIENT_ROW, log_cadence: 'multiple_per_day' });
    adminTables['care_log_entries'] = chain({ count: 3 });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/logs (M8: clinician_profile scoping)', () => {
  const CLINICIAN_DEFINITIONS = [
    {
      key: 'session_feedback_text',
      label: 'Como foi a sessão de hoje?',
      value_type: 'text',
      config: {},
      cadence: 'daily',
      cadence_day: null,
      filled_by: 'clinician',
      clinician_profile: 'psychologist',
      required: false,
      sort_order: 0,
      active: true,
    },
    {
      key: 'med_response',
      label: 'Resposta à medicação',
      value_type: 'scale',
      config: { min: 0, max: 10 },
      cadence: 'daily',
      cadence_day: null,
      filled_by: 'clinician',
      clinician_profile: 'psychiatrist',
      required: false,
      sort_order: 1,
      active: true,
    },
    {
      key: 'shared_note',
      label: 'Observação clínica',
      value_type: 'text',
      config: {},
      cadence: 'daily',
      cadence_day: null,
      filled_by: 'clinician',
      clinician_profile: null,
      required: false,
      sort_order: 2,
      active: true,
    },
  ];

  function mockClinician(clinicalProfile: string | null) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'clinician-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('clinician', RECIPIENT_ROW, clinicalProfile),
    });
    adminTables['metric_definitions'] = chain({ data: CLINICIAN_DEFINITIONS });
    adminTables['care_log_entries'] = chain({ count: 0 });
    mockUserInsert.mockResolvedValue({ error: null });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('accepts the psychologist submitting their own scoped metric', async () => {
    mockClinician('psychologist');
    const res = await POST(
      makeRequest({
        values: { session_feedback_text: 'Boa sessão.', shared_note: null },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects the psychologist submitting a psychiatrist-scoped key', async () => {
    mockClinician('psychologist');
    const res = await POST(makeRequest({ values: { med_response: 7 } }));
    expect(res.status).toBe(400);
  });

  it('accepts a profile-agnostic clinician metric from both specialists', async () => {
    mockClinician('psychiatrist');
    const res = await POST(
      makeRequest({ values: { shared_note: 'ok', med_response: 5 } }),
    );
    expect(res.status).toBe(200);
  });

  it('limits a profile-less clinician to profile-agnostic metrics', async () => {
    mockClinician(null);
    const rejected = await POST(
      makeRequest({ values: { session_feedback_text: 'x' } }),
    );
    expect(rejected.status).toBe(400);
  });

  it('accepts a clinician backdate and stamps that log_date', async () => {
    mockClinician('psychologist');
    const res = await POST(
      makeRequest({
        values: {
          session_feedback_text: 'Sessão remarcada.',
          shared_note: null,
        },
        logDate: '2026-07-03',
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUserInsert).toHaveBeenCalledWith(
      expect.objectContaining({ log_date: '2026-07-03' }),
    );
  });

  it('rejects a future or impossible backdate', async () => {
    mockClinician('psychologist');
    const future = await POST(
      makeRequest({
        values: { session_feedback_text: 'x', shared_note: null },
        logDate: '2999-01-01',
      }),
    );
    expect(future.status).toBe(400);
    const impossible = await POST(
      makeRequest({
        values: { session_feedback_text: 'x', shared_note: null },
        logDate: '2026-02-31',
      }),
    );
    expect(impossible.status).toBe(400);
  });

  it('rejects backdating from non-clinician roles', async () => {
    mockCaregiver();
    const res = await POST(
      makeRequest({ values: validValues, logDate: '2026-07-03' }),
    );
    expect(res.status).toBe(400);
    expect(mockUserInsert).not.toHaveBeenCalled();
  });
});
