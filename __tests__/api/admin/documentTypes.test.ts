import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/admin/document-types/route';
import { PATCH } from '../../../app/api/admin/document-types/[key]/route';
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
  return new NextRequest('http://localhost/api/admin/document-types', {
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

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('GET /api/admin/document-types', () => {
  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest('GET', undefined, null))).status).toBe(401);
  });

  it('returns the defaults for a fresh institution with no rows', async () => {
    mockAdmin();
    adminTables['document_types'] = chain({ data: [] });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentTypes).toEqual([
      { docKey: 'invoice', active: true, copy: {} },
      { docKey: 'prescription', active: true, copy: {} },
      { docKey: 'evaluation', active: true, copy: {} },
    ]);
  });
});

describe('PATCH /api/admin/document-types/[key]', () => {
  const params = Promise.resolve({ key: 'invoice' });

  it('returns 401 without a token', async () => {
    const res = await PATCH(makeRequest('PATCH', { active: false }, null), {
      params,
    });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown doc_key', async () => {
    mockAdmin();
    const res = await PATCH(makeRequest('PATCH', { active: false }), {
      params: Promise.resolve({ key: 'not-a-real-doc-type' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid body', async () => {
    mockAdmin();
    const res = await PATCH(makeRequest('PATCH', { active: 'nope' }), {
      params,
    });
    expect(res.status).toBe(400);
  });

  it('updates the active flag for a valid key', async () => {
    mockAdmin();
    const upsert = jest.fn(() => chain({ data: null, error: null }));
    adminTables['document_types'] = { upsert } as unknown as ReturnType<
      typeof chain
    >;
    const res = await PATCH(makeRequest('PATCH', { active: false }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        institution_id: INSTITUTION_ID,
        doc_key: 'invoice',
        active: false,
      }),
      { onConflict: 'institution_id,doc_key' },
    );
  });
});
