import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/admin/users/route';
import { ROLES } from '../../../lib/constants';
import { resetRateLimiter } from '../../../services/rateLimiter';

const mockGetUser = jest.fn();
const mockListUsers = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    auth: { admin: { listUsers: mockListUsers } },
  }),
}));

function makeRequest(token: string | null = 'valid-token'): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'GET',
    headers,
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

describe('GET /api/admin/users (account picker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
  });

  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
  });

  it('returns 403 for a non-admin caller', async () => {
    mockNonAdmin();
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it('returns every account, id and e-mail only, sorted', async () => {
    mockAdmin();
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'u2', email: 'zara@example.com', app_metadata: {} },
          { id: 'u1', email: 'ana@example.com', app_metadata: {} },
        ],
      },
      error: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([
      { id: 'u1', email: 'ana@example.com' },
      { id: 'u2', email: 'zara@example.com' },
    ]);
    expect(JSON.stringify(body)).not.toContain('app_metadata');
  });

  it('returns 500 when listUsers fails', async () => {
    mockAdmin();
    mockListUsers.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    expect((await GET(makeRequest())).status).toBe(500);
  });
});
