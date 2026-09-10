import { NextRequest } from 'next/server';
import { GET, PATCH } from '../../../app/api/admin/institutions/route';
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

function makeRequest(
  method: 'GET' | 'PATCH',
  body?: unknown,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/institutions', {
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

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('GET /api/admin/institutions', () => {
  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest('GET', undefined, null))).status).toBe(401);
  });

  it("returns the caller's administered institutions", async () => {
    mockAdmin();
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.institutions).toEqual([
      { id: INSTITUTION_ID, name: 'Test Institution' },
    ]);
  });
});

describe('PATCH /api/admin/institutions (rename)', () => {
  it('returns 401 without a token', async () => {
    expect(
      (await PATCH(makeRequest('PATCH', { name: 'New Name' }, null))).status,
    ).toBe(401);
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    expect(
      (await PATCH(makeRequest('PATCH', { name: 'New Name' }))).status,
    ).toBe(403);
  });

  it('rejects an empty name', async () => {
    mockAdmin();
    expect((await PATCH(makeRequest('PATCH', { name: '' }))).status).toBe(400);
  });

  it('rejects a name over 200 characters', async () => {
    mockAdmin();
    expect(
      (await PATCH(makeRequest('PATCH', { name: 'x'.repeat(201) }))).status,
    ).toBe(400);
  });

  it("renames scoped to the caller's own institution, never an id from the body", async () => {
    mockAdmin();
    const eq = jest.fn(() => chain({ data: null, error: null }));
    const update = jest.fn(() => ({ eq }));
    adminTables['institutions'] = { update } as unknown as ReturnType<
      typeof chain
    >;
    const res = await PATCH(
      makeRequest('PATCH', {
        name: 'New Name',
        // A spoofed id in the body must be ignored — the route has no id
        // field in its schema at all, so this simply isn't read.
        id: 'some-other-institution',
      }),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ name: 'New Name' });
    expect(eq).toHaveBeenCalledWith('id', INSTITUTION_ID);
  });

  it('returns 500 when the update fails', async () => {
    mockAdmin();
    adminTables['institutions'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }));
    expect(res.status).toBe(500);
  });
});
