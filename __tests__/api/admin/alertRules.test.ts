import { NextRequest } from 'next/server';
import { GET, POST } from '../../../app/api/admin/alert-rules/route';
import { PATCH } from '../../../app/api/admin/alert-rules/[id]/route';
import { ROLES } from '../../../lib/constants';
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

const RECIPIENT_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(
  method: 'GET' | 'POST' | 'PATCH',
  {
    body,
    search,
    token = 'valid-token',
  }: { body?: unknown; search?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = `http://localhost/api/admin/alert-rules${search ?? ''}`;
  return new NextRequest(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function mockAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-1', app_metadata: { role: ROLES.ADMIN } } },
    error: null,
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', app_metadata: {} } },
    error: null,
  });
}

describe('GET /api/admin/alert-rules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unauthenticated caller', async () => {
    const res = await GET(
      makeRequest('GET', {
        search: `?recipient_id=${RECIPIENT_ID}`,
        token: null,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin caller', async () => {
    mockNonAdmin();
    const res = await GET(
      makeRequest('GET', { search: `?recipient_id=${RECIPIENT_ID}` }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects a missing/invalid recipient_id', async () => {
    mockAdmin();
    const res = await GET(makeRequest('GET', { search: '' }));
    expect(res.status).toBe(400);
  });

  it('lists the recipient’s rules for an admin', async () => {
    mockAdmin();
    adminTables['metric_alert_rules'] = chain({
      data: [{ id: 'rule-1', recipient_id: RECIPIENT_ID }],
    });
    const res = await GET(
      makeRequest('GET', { search: `?recipient_id=${RECIPIENT_ID}` }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toHaveLength(1);
  });
});

describe('POST /api/admin/alert-rules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid input (bad comparator)', async () => {
    mockAdmin();
    const res = await POST(
      makeRequest('POST', {
        body: {
          recipient_id: RECIPIENT_ID,
          metric_key: 'mood_score',
          comparator: 'not-a-comparator',
          threshold: 2,
          label: 'Low mood',
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a rule for an admin with valid input', async () => {
    mockAdmin();
    const insert = jest.fn(() => chain({ data: null }));
    adminTables['metric_alert_rules'] = { insert } as unknown as ReturnType<
      typeof chain
    >;
    const res = await POST(
      makeRequest('POST', {
        body: {
          recipient_id: RECIPIENT_ID,
          metric_key: 'mood_score',
          comparator: 'lte',
          threshold: 2,
          label: 'Low mood',
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: RECIPIENT_ID,
        metric_key: 'mood_score',
      }),
    );
  });
});

describe('PATCH /api/admin/alert-rules/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-admin caller', async () => {
    mockNonAdmin();
    const res = await PATCH(makeRequest('PATCH', { body: { active: false } }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('updates a rule for an admin', async () => {
    mockAdmin();
    const eq = jest.fn(() => chain({ data: null }));
    const update = jest.fn(() => ({ eq }));
    adminTables['metric_alert_rules'] = { update } as unknown as ReturnType<
      typeof chain
    >;
    const res = await PATCH(makeRequest('PATCH', { body: { active: false } }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 'rule-1');
  });
});
