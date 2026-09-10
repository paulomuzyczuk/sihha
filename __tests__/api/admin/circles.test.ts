import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/admin/circles/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
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

function makeRequest(token: string | null = 'valid-token'): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/circles', {
    method: 'GET',
    headers,
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

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('GET /api/admin/circles', () => {
  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it("lists the caller institution's active circles", async () => {
    mockAdmin();
    adminTables['care_recipients'] = chain({
      data: [
        { id: 'r1', display_name: 'Alex' },
        { id: 'r2', display_name: 'Bea' },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.circles).toEqual([
      { id: 'r1', displayName: 'Alex' },
      { id: 'r2', displayName: 'Bea' },
    ]);
    expect(adminTables['care_recipients'].eq).toHaveBeenCalledWith(
      'institution_id',
      INSTITUTION_ID,
    );
    expect(adminTables['care_recipients'].eq).toHaveBeenCalledWith(
      'active',
      true,
    );
  });

  it('returns 500 when the query fails', async () => {
    mockAdmin();
    adminTables['care_recipients'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    expect((await GET(makeRequest())).status).toBe(500);
  });
});
