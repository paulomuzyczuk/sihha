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

  it('returns 403 for a clinician (read-side role)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'clinician-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('clinician'),
    });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(403);
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

  it('returns 409 when a one_per_day recipient already has an entry today', async () => {
    mockCaregiver();
    adminTables['care_log_entries'] = chain({ count: 1 });
    const res = await POST(makeRequest({ values: validValues }));
    expect(res.status).toBe(409);
    expect(mockUserInsert).not.toHaveBeenCalled();
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
