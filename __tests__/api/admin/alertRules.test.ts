import { NextRequest } from 'next/server';
import { GET, POST } from '../../../app/api/admin/alert-rules/route';
import { PATCH } from '../../../app/api/admin/alert-rules/[id]/route';
import { chain, institutionAdminRow } from '../../helpers/careTeamMock';

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

const INSTITUTION_ID = '99999999-9999-9999-9999-999999999999';
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
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({
    data: [institutionAdminRow(INSTITUTION_ID)],
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({ data: [] });
}

function mockRecipientInInstitution() {
  adminTables['care_recipients'] = chain({ data: { id: RECIPIENT_ID } });
}

function mockRecipientOutsideInstitution() {
  adminTables['care_recipients'] = chain({ data: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('GET /api/admin/alert-rules', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await GET(
      makeRequest('GET', {
        search: `?recipient_id=${RECIPIENT_ID}`,
        token: null,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a caller who administers no institution', async () => {
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

  it('rejects a recipient belonging to a different institution', async () => {
    mockAdmin();
    mockRecipientOutsideInstitution();
    const res = await GET(
      makeRequest('GET', { search: `?recipient_id=${RECIPIENT_ID}` }),
    );
    expect(res.status).toBe(403);
  });

  it('lists the recipient’s rules for an institution admin', async () => {
    mockAdmin();
    mockRecipientInInstitution();
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
  it('rejects invalid input (bad comparator)', async () => {
    mockAdmin();
    mockRecipientInInstitution();
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

  it("rejects a rule targeting another institution's recipient", async () => {
    mockAdmin();
    mockRecipientOutsideInstitution();
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
    expect(res.status).toBe(403);
  });

  it('creates a rule for an institution admin with valid input', async () => {
    mockAdmin();
    mockRecipientInInstitution();
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
  it('rejects a caller who administers no institution', async () => {
    mockNonAdmin();
    const res = await PATCH(makeRequest('PATCH', { body: { active: false } }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a rule belonging to a different institution', async () => {
    mockAdmin();
    adminTables['metric_alert_rules'] = chain({
      data: { recipient_id: RECIPIENT_ID },
    });
    mockRecipientOutsideInstitution();
    const res = await PATCH(makeRequest('PATCH', { body: { active: false } }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('updates a rule for an institution admin', async () => {
    mockAdmin();
    mockRecipientInInstitution();
    const eq = jest.fn(() => chain({ data: null }));
    const update = jest.fn(() => ({ eq }));
    adminTables['metric_alert_rules'] = {
      select: jest.fn(() => chain({ data: { recipient_id: RECIPIENT_ID } })),
      update,
    } as unknown as ReturnType<typeof chain>;
    const res = await PATCH(makeRequest('PATCH', { body: { active: false } }), {
      params: Promise.resolve({ id: 'rule-1' }),
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 'rule-1');
  });
});
