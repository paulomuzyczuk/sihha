import { NextRequest } from 'next/server';
import { GET, POST } from '../../../app/api/admin/recipients/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { ROLES } from '../../../lib/constants';
import { getTemplate } from '../../../templates';
import { chain } from '../../helpers/careTeamMock';

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

function makeRequest(
  method: 'GET' | 'POST',
  body?: unknown,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/recipients', {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const adminUser = {
  id: 'admin-uuid',
  email: 'admin@example.com',
  app_metadata: { role: ROLES.ADMIN },
};

function mockAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: adminUser }, error: null });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: 'user-1', email: 'u@example.com', app_metadata: {} },
    },
    error: null,
  });
}

const validBody = {
  template_id: 'pet-care',
  display_name: 'Bolinha',
  timezone: 'America/Manaus',
};

describe('GET /api/admin/recipients (template list)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest('GET', undefined, null))).status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockNonAdmin();
    expect((await GET(makeRequest('GET'))).status).toBe(403);
  });

  it('lists the available templates with identity fields only', async () => {
    mockAdmin();
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates.map((t: { id: string }) => t.id)).toEqual([
      'mental-health',
      'elder-care',
      'pet-care',
    ]);
    expect(body.templates[0]).toMatchObject({
      name: expect.any(String),
      metricCount: expect.any(Number),
    });
    expect(JSON.stringify(body)).not.toContain('"metrics"');
  });
});

describe('POST /api/admin/recipients (create from template)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['care_recipients'] = chain({
      data: { id: 'new-recipient', display_name: 'Bolinha' },
    });
  });

  it('returns 401 without a token', async () => {
    expect((await POST(makeRequest('POST', validBody, null))).status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockNonAdmin();
    expect((await POST(makeRequest('POST', validBody))).status).toBe(403);
  });

  it('returns 400 for an unknown template, bad timezone or missing name', async () => {
    mockAdmin();
    expect(
      (await POST(makeRequest('POST', { ...validBody, template_id: 'nope' })))
        .status,
    ).toBe(400);
    expect(
      (await POST(makeRequest('POST', { ...validBody, timezone: 'Not/AZone' })))
        .status,
    ).toBe(400);
    expect(
      (await POST(makeRequest('POST', { ...validBody, display_name: '' })))
        .status,
    ).toBe(400);
  });

  it('creates the recipient from the template and reports it', async () => {
    mockAdmin();
    const res = await POST(makeRequest('POST', validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    const template = getTemplate('pet-care')!;
    expect(body.recipient).toEqual({
      id: 'new-recipient',
      displayName: 'Bolinha',
    });
    expect(body.metricCount).toBe(template.metrics.length);

    expect(adminTables['care_recipients'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'Bolinha',
        kind: 'pet',
        timezone: 'America/Manaus',
        log_cadence: 'one_per_day',
      }),
    );
  });

  it('inserts the template metric rows and the admin as owner', async () => {
    mockAdmin();
    adminTables['metric_definitions'] = chain({ data: [] });
    adminTables['alert_configs'] = chain({ data: [] });
    adminTables['care_team_members'] = chain({ data: [] });

    const res = await POST(makeRequest('POST', validBody));
    expect(res.status).toBe(201);

    const template = getTemplate('pet-care')!;
    const metricRows =
      adminTables['metric_definitions'].insert.mock.calls[0][0];
    expect(metricRows).toHaveLength(template.metrics.length);
    expect(metricRows[0]).toMatchObject({
      recipient_id: 'new-recipient',
      key: 'fed',
      sort_order: 0,
    });

    expect(adminTables['alert_configs'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'new-recipient',
        missing_log_hour: 21,
        low_stock_days: 7,
      }),
    );

    expect(adminTables['care_team_members'].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'new-recipient',
        user_id: 'admin-uuid',
        role: 'owner',
      }),
    );
  });

  it('honours a log_cadence override', async () => {
    mockAdmin();
    const res = await POST(
      makeRequest('POST', { ...validBody, log_cadence: 'multiple_per_day' }),
    );
    expect(res.status).toBe(201);
    expect(adminTables['care_recipients'].insert).toHaveBeenCalledWith(
      expect.objectContaining({ log_cadence: 'multiple_per_day' }),
    );
  });

  it('rolls back the recipient when instantiation fails midway', async () => {
    mockAdmin();
    adminTables['metric_definitions'] = chain({
      data: null,
      error: { message: 'boom' },
    });

    const res = await POST(makeRequest('POST', validBody));
    expect(res.status).toBe(500);
    expect(adminTables['care_recipients'].delete).toHaveBeenCalled();
  });

  it('returns 500 when the recipient insert fails', async () => {
    mockAdmin();
    adminTables['care_recipients'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await POST(makeRequest('POST', validBody));
    expect(res.status).toBe(500);
  });
});
