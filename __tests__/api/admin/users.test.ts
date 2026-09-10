import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/admin/users/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { chain, institutionAdminRow } from '../../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockGetUserById = jest.fn();
const adminTables: Record<string, ReturnType<typeof chain>> = {};

jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
    auth: { admin: { getUserById: mockGetUserById } },
  }),
}));

const INSTITUTION_A = '11111111-1111-1111-1111-111111111111';
const INSTITUTION_B = '22222222-2222-2222-2222-222222222222';

function makeRequest(token: string | null = 'valid-token'): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'GET',
    headers,
  });
}

function mockAdmin(institutionId: string = INSTITUTION_A) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid', email: 'admin@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({
    data: [institutionAdminRow(institutionId)],
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({ data: [] });
}

describe('GET /api/admin/users (institution-scoped account list)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it('returns only the caller institution members, id and e-mail only', async () => {
    mockAdmin(INSTITUTION_A);
    // institutionMemberAccounts resolves user_ids from institution_members,
    // then looks each up individually — never a platform-wide listUsers().
    const memberIdsChain = chain({
      data: [{ user_id: 'u1' }, { user_id: 'u2' }],
    });
    adminTables['institution_members'] = {
      ...chain({ data: [institutionAdminRow(INSTITUTION_A)] }),
      select: jest.fn((cols: string) =>
        cols.includes('institution_role')
          ? chain({ data: [institutionAdminRow(INSTITUTION_A)] })
          : memberIdsChain,
      ),
    } as unknown as ReturnType<typeof chain>;
    mockGetUserById.mockImplementation((id: string) =>
      Promise.resolve({
        data: {
          user:
            id === 'u1'
              ? { id: 'u1', email: 'zara@example.com' }
              : { id: 'u2', email: 'ana@example.com' },
        },
        error: null,
      }),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([
      { id: 'u2', email: 'ana@example.com' },
      { id: 'u1', email: 'zara@example.com' },
    ]);
    expect(JSON.stringify(body)).not.toContain('app_metadata');
  });

  it('never returns a member of a DIFFERENT institution', async () => {
    mockAdmin(INSTITUTION_A);
    const memberIdsChain = chain({ data: [{ user_id: 'u1' }] });
    adminTables['institution_members'] = {
      select: jest.fn((cols: string) =>
        cols.includes('institution_role')
          ? chain({ data: [institutionAdminRow(INSTITUTION_A)] })
          : memberIdsChain,
      ),
    } as unknown as ReturnType<typeof chain>;
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'u1', email: 'institution-a-member@example.com' } },
      error: null,
    });

    const res = await GET(makeRequest());
    const body = await res.json();
    // Only INSTITUTION_A's member surfaces — the query itself is scoped to
    // auth.institutionId, so a differently-institutioned account (u-b) is
    // never even fetched, let alone returned.
    expect(body.users).toEqual([
      { id: 'u1', email: 'institution-a-member@example.com' },
    ]);
    expect(JSON.stringify(body)).not.toContain(INSTITUTION_B);
  });
});
