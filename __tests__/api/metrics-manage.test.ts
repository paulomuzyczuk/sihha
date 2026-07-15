import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/metrics/route';
import { PATCH } from '../../app/api/metrics/[key]/route';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows } from '../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

function makeRequest(
  method: 'GET' | 'POST',
  body?: unknown,
  query = '',
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/metrics${query}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makePatchRequest(
  key: string,
  body: unknown,
  token: string | null = 'valid-token',
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const req = new NextRequest(`http://localhost/api/metrics/${key}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ key }) });
}

function mockRole(role: 'owner' | 'caregiver' | 'clinician' | 'recipient') {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({ data: membershipRows(role) });
}

const EXISTING_DEFS = [
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
    key: 'old_metric',
    label: 'Antiga',
    value_type: 'boolean',
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 1,
    active: false,
  },
];

describe('GET /api/metrics include_inactive (M4 owner editor)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({ data: EXISTING_DEFS });
  });

  it('keeps the active-only contract without the flag', async () => {
    mockRole('caregiver');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    // active-only filter applied (the chain records the eq call)
    expect(adminTables['metric_definitions'].eq).toHaveBeenCalledWith(
      'active',
      true,
    );
  });

  it('honours include_inactive=1 for owners only', async () => {
    mockRole('owner');
    const res = await GET(makeRequest('GET', undefined, '?include_inactive=1'));
    expect(res.status).toBe(200);
    expect(adminTables['metric_definitions'].eq).not.toHaveBeenCalledWith(
      'active',
      true,
    );
  });

  it('ignores include_inactive for non-owner members', async () => {
    mockRole('clinician');
    const res = await GET(makeRequest('GET', undefined, '?include_inactive=1'));
    expect(res.status).toBe(200);
    expect(adminTables['metric_definitions'].eq).toHaveBeenCalledWith(
      'active',
      true,
    );
  });
});

describe('POST /api/metrics (owner create)', () => {
  const validBody = {
    key: 'hydration_glasses',
    label: 'Copos de água',
    value_type: 'number',
    config: { unit: 'copos', min: 0, max: 20 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({
      data: EXISTING_DEFS.map(({ key, sort_order }) => ({ key, sort_order })),
    });
  });

  it('returns 403 for non-owner roles', async () => {
    mockRole('caregiver');
    expect((await POST(makeRequest('POST', validBody))).status).toBe(403);
  });

  it('returns 400 for a malformed key, unknown type or bad config', async () => {
    mockRole('owner');
    expect(
      (await POST(makeRequest('POST', { ...validBody, key: 'Bad-Key' })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest('POST', { ...validBody, value_type: 'freeform' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest('POST', {
            ...validBody,
            value_type: 'enum',
            config: { options: [] },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest('POST', {
            ...validBody,
            config: { min: 10, max: 1 },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('returns 400 for a weekly metric without cadence_day', async () => {
    mockRole('owner');
    expect(
      (await POST(makeRequest('POST', { ...validBody, cadence: 'weekly' })))
        .status,
    ).toBe(400);
  });

  it('returns 409 when the key already exists (even retired)', async () => {
    mockRole('owner');
    expect(
      (await POST(makeRequest('POST', { ...validBody, key: 'old_metric' })))
        .status,
    ).toBe(409);
  });

  it('returns 400 when depends_on references a missing key', async () => {
    mockRole('owner');
    expect(
      (
        await POST(
          makeRequest('POST', {
            ...validBody,
            config: { depends_on: 'ghost' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('creates the metric at the end of the sort order', async () => {
    mockRole('owner');
    const res = await POST(makeRequest('POST', validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      created: true,
      key: 'hydration_glasses',
      sort_order: 2,
    });
    expect(adminTables['metric_definitions'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'recipient-1',
        key: 'hydration_glasses',
        value_type: 'number',
        cadence: 'daily',
        cadence_day: null,
        filled_by: 'caregiver',
        required: false,
        sort_order: 2,
      }),
    );
  });
});

describe('PATCH /api/metrics/[key] (owner update)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({ data: EXISTING_DEFS[0] });
    adminTables['care_log_entries'] = chain({ data: [] });
  });

  it('returns 403 for non-owner roles', async () => {
    mockRole('clinician');
    expect((await makePatchRequest('mood', { label: 'x' })).status).toBe(403);
  });

  it('returns 404 for an unknown metric key', async () => {
    mockRole('owner');
    adminTables['metric_definitions'] = chain({ data: null });
    expect((await makePatchRequest('ghost', { label: 'x' })).status).toBe(404);
  });

  it('returns 400 for an empty patch', async () => {
    mockRole('owner');
    expect((await makePatchRequest('mood', {})).status).toBe(400);
  });

  it('updates label, required, active and sort_order', async () => {
    mockRole('owner');
    const res = await makePatchRequest('mood', {
      label: 'Humor do dia',
      required: false,
      active: false,
      sort_order: 5,
    });
    expect(res.status).toBe(200);
    expect(adminTables['metric_definitions'].update).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Humor do dia',
        required: false,
        active: false,
        sort_order: 5,
      }),
    );
  });

  it('blocks a value_type change once entries reference the key', async () => {
    mockRole('owner');
    adminTables['care_log_entries'] = chain({ data: [{ id: 'entry-1' }] });
    const res = await makePatchRequest('mood', { value_type: 'number' });
    expect(res.status).toBe(409);
    expect(adminTables['metric_definitions'].update).not.toHaveBeenCalled();
  });

  it('allows a value_type change while no entry references the key', async () => {
    mockRole('owner');
    const res = await makePatchRequest('mood', { value_type: 'number' });
    expect(res.status).toBe(200);
    expect(adminTables['metric_definitions'].update).toHaveBeenCalledWith(
      expect.objectContaining({ value_type: 'number' }),
    );
  });

  it('rejects config incoherent with the (resulting) type', async () => {
    mockRole('owner');
    const res = await makePatchRequest('mood', {
      config: { min: 5, max: 1 },
    });
    expect(res.status).toBe(400);
  });
});

describe('clinician_profile scoping (M8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({
      data: EXISTING_DEFS.map(({ key, sort_order }) => ({ key, sort_order })),
    });
  });

  it('GET reports the caller effective clinical profile', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('clinician', undefined, 'psychologist'),
    });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).clinicalProfile).toBe('psychologist');
  });

  it('GET lists the last attended appointments for a clinician', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('clinician', undefined, 'psychiatrist'),
    });
    adminTables['care_log_entries'] = chain({
      count: 0,
      data: [{ log_date: '2026-07-10' }, { log_date: '2026-07-03' }],
    });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).appointmentDates).toEqual([
      '2026-07-10',
      '2026-07-03',
    ]);
  });

  it('GET returns no appointment dates for non-clinician roles', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows('caregiver'),
    });
    adminTables['care_log_entries'] = chain({
      count: 0,
      data: [{ log_date: '2026-07-10' }],
    });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    expect((await res.json()).appointmentDates).toEqual([]);
  });

  it('POST rejects clinician_profile on a non-clinician metric', async () => {
    mockRole('owner');
    const res = await POST(
      makeRequest('POST', {
        key: 'phq9',
        label: 'PHQ-9',
        value_type: 'scale',
        config: { min: 0, max: 27 },
        filled_by: 'caregiver',
        clinician_profile: 'psychiatrist',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST stores clinician_profile on a clinician metric', async () => {
    mockRole('owner');
    const res = await POST(
      makeRequest('POST', {
        key: 'phq9',
        label: 'PHQ-9',
        value_type: 'scale',
        config: { min: 0, max: 27 },
        filled_by: 'clinician',
        clinician_profile: 'psychiatrist',
      }),
    );
    expect(res.status).toBe(201);
    expect(adminTables['metric_definitions'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        filled_by: 'clinician',
        clinician_profile: 'psychiatrist',
      }),
    );
  });

  it('PATCH rejects clinician_profile when the stored metric is not clinician-filled', async () => {
    mockRole('owner');
    adminTables['metric_definitions'] = chain({
      data: {
        key: 'mood',
        value_type: 'scale',
        config: { min: 1, max: 5 },
        cadence: 'daily',
        cadence_day: null,
        cadence_days: null,
        cadence_start: null,
        filled_by: 'caregiver',
        clinician_profile: null,
      },
    });
    const res = await makePatchRequest('mood', {
      clinician_profile: 'psychologist',
    });
    expect(res.status).toBe(400);
  });
});
