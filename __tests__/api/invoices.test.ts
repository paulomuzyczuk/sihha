import { POST } from '../../app/api/invoices/route';
import { NextRequest } from 'next/server';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

const mockGetUser = jest.fn();
const mockInsert = jest.fn();

// The user-scoped client verifies the token and performs the RLS-enforced insert
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
    from: jest.fn().mockImplementation(() => ({ insert: mockInsert })),
  })),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

describe('POST /api/invoices (M3: membership-scoped)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const validPayload = {
    amount: 45.5,
    fileUrl:
      'https://mockproject.supabase.co/storage/v1/object/public/invoices/groceries_01.pdf',
    location: {
      lat: 52.52,
      lng: 13.405,
    },
  };

  const createRequest = (
    payload: unknown,
    token?: string,
    ip = '127.0.0.1',
  ) => {
    const headers = new Headers();
    headers.set('x-forwarded-for', ip);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  };

  function mockRole(
    role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
    userId = 'user-1',
  ) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    adminTables['care_team_members'] = chain({ data: membershipRows(role) });
  }

  it('should return 401 if Authorization header is missing', async () => {
    const res = await POST(createRequest(validPayload));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it('should return 403 for a clinician (not an invoice role)', async () => {
    mockRole('clinician');
    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Forbidden: Insufficient permissions',
    });
  });

  it('should insert an invoice for a caregiver (grocery-run logging)', async () => {
    mockRole('caregiver', 'user-caregiver-1');
    mockInsert.mockResolvedValueOnce({ error: null });

    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45.5,
        user_id: 'user-caregiver-1',
        recipient_id: RECIPIENT_ROW.id,
      }),
    );
  });

  it('should return 400 if amount is negative', async () => {
    mockRole('recipient');
    const res = await POST(
      createRequest({ ...validPayload, amount: -5.0 }, 'token'),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
    });
  });

  it('should return 400 if fileUrl is from an untrusted domain (SSRF protection)', async () => {
    mockRole('recipient');
    const res = await POST(
      createRequest(
        {
          ...validPayload,
          fileUrl: 'https://malicious-domain.com/groceries_01.pdf',
        },
        'token',
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
    });
  });

  it('should insert a recipient-scoped invoice for the recipient role', async () => {
    mockRole('recipient', 'user-patient-1');
    mockInsert.mockResolvedValueOnce({ error: null });

    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // id/createdAt are generated server-side (write-only RLS can't return them)
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45.5,
        file_url:
          'https://mockproject.supabase.co/storage/v1/object/public/invoices/groceries_01.pdf',
        lat: 52.52,
        lng: 13.405,
        user_id: 'user-patient-1',
        recipient_id: RECIPIENT_ROW.id,
      }),
    );
  });

  it('should insert an invoice for the owner role (admin audit path)', async () => {
    mockRole('owner', 'user-admin-1');
    mockInsert.mockResolvedValueOnce({ error: null });

    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
