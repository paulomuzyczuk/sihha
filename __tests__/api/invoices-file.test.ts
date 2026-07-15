import { NextRequest } from 'next/server';
import { GET } from '../../app/api/invoices/file/route';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

// GET /api/invoices/file mints a short-lived signed URL for a PRIVATE invoice
// document. It is the only read path for financial files, so it must: reject
// the wrong role, reject a cross-circle ?recipient= probe, scope the lookup to
// the caller's own circle, and never leak a raw storage/DB error. "A security
// control with no test does not exist."

const mockGetUser = jest.fn();
const mockCreateSignedUrl = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ insert: jest.fn() }),
  }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
  }),
}));

const INVOICE_ID = '11111111-1111-1111-1111-111111111111';
const INVOICE_ROW = {
  id: INVOICE_ID,
  file_url:
    'https://mockproject.supabase.co/storage/v1/object/invoices/user-1/1720-receipt.pdf',
};

function makeRequest(
  token: string | null = 'valid-token',
  // null → omit the param entirely (undefined would trigger the default)
  invoiceParam: string | null = INVOICE_ID,
  recipientParam?: string,
): NextRequest {
  const headers: Record<string, string> = { 'x-forwarded-for': '127.0.0.1' };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL('http://localhost/api/invoices/file');
  if (invoiceParam !== null) url.searchParams.set('invoice', invoiceParam);
  if (recipientParam !== undefined)
    url.searchParams.set('recipient', recipientParam);
  return new NextRequest(url, { method: 'GET', headers });
}

function mockRole(
  role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
  clinicalProfile: string | null = null,
) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({
    data: membershipRows(role, RECIPIENT_ROW, clinicalProfile),
  });
}

describe('GET /api/invoices/file (owner-only signed-URL reader)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://mockproject.supabase.co/signed?token=abc' },
      error: null,
    });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it.each(['caregiver', 'recipient', 'clinician'] as const)(
    'returns 403 for the %s role (only the owner audits invoices)',
    async (role) => {
      mockRole(role);
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
      expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    },
  );

  it('returns 403 when an owner probes another circle via ?recipient=', async () => {
    mockRole('owner');
    const res = await GET(
      makeRequest('valid-token', INVOICE_ID, 'recipient-2'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when the invoice param is missing', async () => {
    mockRole('owner');
    const res = await GET(makeRequest('valid-token', null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
    });
  });

  it('returns 400 when the invoice param is not a uuid', async () => {
    mockRole('owner');
    const res = await GET(makeRequest('valid-token', 'not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the invoice is not in the caller circle', async () => {
    mockRole('owner');
    adminTables['invoices'] = chain({ data: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a signed URL scoped to the caller circle and object key', async () => {
    mockRole('owner');
    adminTables['invoices'] = chain({ data: INVOICE_ROW });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      url: 'https://mockproject.supabase.co/signed?token=abc',
      expiresIn: 60,
    });
    // Lookup pinned to the caller's own recipient — never global.
    expect(adminTables['invoices'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
    // The bucket + object key are extracted from the stored file_url.
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'user-1/1720-receipt.pdf',
      60,
    );
  });

  it('signs legacy public-form file_url rows too', async () => {
    mockRole('owner');
    adminTables['invoices'] = chain({
      data: {
        id: INVOICE_ID,
        file_url:
          'https://mockproject.supabase.co/storage/v1/object/public/invoices/user-1/old.pdf',
      },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/old.pdf', 60);
  });

  it('returns 500 without leaking the DB error', async () => {
    mockRole('owner');
    adminTables['invoices'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 500 when signing fails (no partial/leaky response)', async () => {
    mockRole('owner');
    adminTables['invoices'] = chain({ data: INVOICE_ROW });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'object not found' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
