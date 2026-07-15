import { POST } from '../../app/api/evaluations/route';
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

describe('POST /api/evaluations (M10: psychologist-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const validPayload = {
    fileUrl:
      'https://mockproject.supabase.co/storage/v1/object/evaluations/user-1/wais_2026.pdf',
    notes: 'WAIS-IV aplicado em consultório.',
  };

  const createRequest = (payload: unknown, token?: string, query = '') => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '127.0.0.1');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return new NextRequest(`http://localhost/api/evaluations${query}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  };

  function mockMember(
    role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
    clinicalProfile: string | null = null,
    opts: { userId?: string; admin?: boolean } = {},
  ) {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: opts.userId ?? 'user-1',
          app_metadata: opts.admin ? { role: 'ADMIN' } : {},
        },
      },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows(role, RECIPIENT_ROW, clinicalProfile),
    });
  }

  it('returns 401 without a token', async () => {
    const res = await POST(createRequest(validPayload));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it.each(['owner', 'caregiver', 'recipient'] as const)(
    'returns 403 for the %s role',
    async (role) => {
      mockMember(role);
      const res = await POST(createRequest(validPayload, 'token'));
      expect(res.status).toBe(403);
    },
  );

  it('returns 403 for a clinician with the psychiatrist profile', async () => {
    mockMember('clinician', 'psychiatrist');
    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns 403 for a clinician without a clinical profile', async () => {
    mockMember('clinician', null);
    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(403);
  });

  it('returns 400 on a malformed body', async () => {
    mockMember('clinician', 'psychologist');
    const res = await POST(createRequest({ notes: 'sem arquivo' }, 'token'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileUrl is on a foreign host (SSRF protection)', async () => {
    mockMember('clinician', 'psychologist');
    const res = await POST(
      createRequest(
        { ...validPayload, fileUrl: 'https://malicious.example/laudo.pdf' },
        'token',
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
    });
  });

  it('inserts the evaluation for the psychologist clinician', async () => {
    mockMember('clinician', 'psychologist', { userId: 'user-psi-1' });
    mockInsert.mockResolvedValueOnce({ error: null });

    const res = await POST(createRequest(validPayload, 'token'));
    expect(res.status).toBe(201);
    const body = await res.json();
    // id/createdAt are generated server-side (write-only RLS can't return them)
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        file_url: validPayload.fileUrl,
        notes: validPayload.notes,
        user_id: 'user-psi-1',
        recipient_id: RECIPIENT_ROW.id,
      }),
    );
  });

  it('stores null notes when omitted', async () => {
    mockMember('clinician', 'psychologist');
    mockInsert.mockResolvedValueOnce({ error: null });
    const res = await POST(
      createRequest({ fileUrl: validPayload.fileUrl }, 'token'),
    );
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });

  it('accepts the admin preview via view_as=clinician&view_profile=psychologist', async () => {
    // The admin's real membership is owner; the substitution supplies both
    // the clinician role and the psychologist profile for this request.
    mockMember('owner', null, { admin: true });
    mockInsert.mockResolvedValueOnce({ error: null });
    const res = await POST(
      createRequest(
        validPayload,
        'token',
        '?view_as=clinician&view_profile=psychologist',
      ),
    );
    expect(res.status).toBe(201);
  });

  it('rejects the psychiatrist preview (403)', async () => {
    mockMember('owner', null, { admin: true });
    const res = await POST(
      createRequest(
        validPayload,
        'token',
        '?view_as=clinician&view_profile=psychiatrist',
      ),
    );
    expect(res.status).toBe(403);
  });

  it('rejects view_profile from a non-admin outright', async () => {
    mockMember('clinician', 'psychologist');
    const res = await POST(
      createRequest(
        validPayload,
        'token',
        '?view_as=clinician&view_profile=psychologist',
      ),
    );
    expect(res.status).toBe(403);
  });

  it('rejects view_profile without view_as=clinician', async () => {
    mockMember('owner', null, { admin: true });
    const res = await POST(
      createRequest(validPayload, 'token', '?view_profile=psychologist'),
    );
    expect(res.status).toBe(403);
  });
});
