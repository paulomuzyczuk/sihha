import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/admin/users/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { ROLES } from '../../../lib/constants';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockListUsers = jest.fn();

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
    data: {
      user: {
        id: 'admin-uuid',
        email: 'admin@example.com',
        app_metadata: { role: ROLES.ADMIN },
      },
    },
    error: null,
  });
}

describe('GET /api/admin/users (owner picker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
  });

  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'u@example.com', app_metadata: {} },
      },
      error: null,
    });
    expect((await GET(makeRequest())).status).toBe(403);
  });

  it('returns id and e-mail only, sorted by e-mail', async () => {
    mockAdmin();
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: 'u2',
            email: 'zara@example.com',
            app_metadata: { role: 'THERAPIST' },
          },
          { id: 'u3', email: undefined },
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

  it('returns 500 when the user listing fails', async () => {
    mockAdmin();
    mockListUsers.mockResolvedValue({
      data: { users: [] },
      error: { message: 'boom' },
    });
    expect((await GET(makeRequest())).status).toBe(500);
  });
});
