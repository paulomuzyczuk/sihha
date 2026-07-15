import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/psychometrics/route';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

// /api/psychometrics returns the most sensitive data in the platform —
// neuropsychological evaluation scores. It had ZERO test coverage: nothing
// proved its authorizeCareRequest(['clinician','owner']) preamble actually
// rejects the wrong role, an unauthenticated caller, or a cross-circle
// ?recipient= probe. "A security control with no test does not exist."

const mockGetUser = jest.fn();
const mockInsert = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ insert: mockInsert }),
  }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const RESULT_ROW = {
  test_date: '2026-03-01',
  instrument: 'WAIS-IV',
  measure: 'Full Scale IQ',
  raw_score: 98,
  percentile: 45,
  classification: 'Average',
};

function makeRequest(
  token: string | null = 'valid-token',
  recipientParam?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL('http://localhost/api/psychometrics');
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

describe('GET /api/psychometrics (membership-scoped, clinician/owner only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it('returns 403 for a caregiver (not a psychometrics reader)', async () => {
    mockRole('caregiver');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 for the recipient themselves (write-only for the patient)', async () => {
    mockRole('recipient');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 when a member of one circle probes another via ?recipient=', async () => {
    // The caller is a clinician in recipient-1's circle; membershipRows only
    // contains recipient-1. Requesting recipient-2 must not resolve to any
    // membership, so authorizeCareRequest rejects it — the cross-circle
    // authorization boundary the threat model names as highest priority.
    mockRole('clinician');
    const res = await GET(makeRequest('valid-token', 'recipient-2'));
    expect(res.status).toBe(403);
  });

  it('returns the recipient-scoped results for a clinician', async () => {
    mockRole('clinician');
    adminTables['psychometric_results'] = chain({ data: [RESULT_ROW] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      testDate: '2026-03-01',
      instrument: 'WAIS-IV',
      measure: 'Full Scale IQ',
      rawScore: 98,
      percentile: 45,
      classification: 'Average',
    });
    // Query must be scoped to the caller's own circle recipient, never global.
    expect(adminTables['psychometric_results'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
  });

  it('allows the owner (audit view) and returns 500 on a DB error', async () => {
    mockRole('owner');
    adminTables['psychometric_results'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    // No raw DB message leaked to the caller.
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/psychometrics (psychologist fills test results)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const validResult = {
    testDate: '2026-03-01',
    instrument: 'WAIS-IV',
    measure: 'Full Scale IQ',
    rawScore: 98,
    percentile: 45,
    classification: 'Average',
  };

  function postRequest(payload: unknown, token: string | null = 'valid-token') {
    const headers: Record<string, string> = {};
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;
    return new NextRequest('http://localhost/api/psychometrics', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  it('returns 401 without a token', async () => {
    expect((await POST(postRequest(validResult, null))).status).toBe(401);
  });

  it('returns 403 for a clinician who is NOT a psychologist (psychiatrist)', async () => {
    mockRole('clinician', 'psychiatrist');
    const res = await POST(postRequest(validResult));
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns 403 for the owner (not a clinician write role)', async () => {
    mockRole('owner');
    expect((await POST(postRequest(validResult))).status).toBe(403);
  });

  it('returns 400 for a malformed payload (bad test date)', async () => {
    mockRole('clinician', 'psychologist');
    const res = await POST(
      postRequest({ ...validResult, testDate: '03/2026' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
    });
  });

  it('inserts a recipient-scoped, author-stamped result for a psychologist', async () => {
    mockRole('clinician', 'psychologist');
    mockInsert.mockResolvedValueOnce({ error: null });

    const res = await POST(postRequest(validResult));
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: 'user-1',
        recipient_id: RECIPIENT_ROW.id,
        test_date: '2026-03-01',
        instrument: 'WAIS-IV',
        raw_score: 98,
        percentile: 45,
      }),
    );
  });
});
