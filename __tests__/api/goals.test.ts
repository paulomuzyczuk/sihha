import { NextRequest } from 'next/server';
import { GET } from '../../app/api/goals/route';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

// /api/goals was at 0% coverage (137 lines). The scoring math is covered in
// __tests__/services/goals.test.ts; this is the missing preamble/scoping smoke
// test — that authorizeCareRequest gates the route and every DB read is pinned
// to the caller's own circle recipient. Kept deterministic: the month-clamp
// path depends on localDate(now), so assertions stay on auth, scoping, and
// response shape, not on today-relative month values.

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

function makeRequest(
  token: string | null = 'valid-token',
  recipientParam?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL('http://localhost/api/goals');
  if (recipientParam !== undefined)
    url.searchParams.set('recipient', recipientParam);
  return new NextRequest(url, { method: 'GET', headers });
}

function mockRole(role: 'owner' | 'caregiver' | 'clinician' | 'recipient') {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({ data: membershipRows(role) });
}

describe('GET /api/goals (membership-scoped, all circle roles)', () => {
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

  it('returns 403 when a member probes another circle via ?recipient=', async () => {
    // Caller belongs to recipient-1 only; requesting recipient-2 must not
    // resolve to a membership. Cross-circle authorization boundary.
    mockRole('caregiver');
    const res = await GET(makeRequest('valid-token', 'recipient-2'));
    expect(res.status).toBe(403);
  });

  it('returns program:null (not 500) when the recipient has no goal program', async () => {
    mockRole('recipient');
    // Real Supabase .maybeSingle() yields null (not []) when no row matches.
    adminTables['goal_programs'] = chain({ data: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ program: null, progress: null });
  });

  it('scopes the goal_programs read to the caller’s own recipient', async () => {
    mockRole('caregiver');
    adminTables['goal_programs'] = chain({ data: null });
    await GET(makeRequest());
    expect(adminTables['goal_programs'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
    // active-only filter is part of the same scoping contract
    expect(adminTables['goal_programs'].eq).toHaveBeenCalledWith(
      'active',
      true,
    );
  });

  it('assembles a progress payload for an active program', async () => {
    mockRole('owner');
    adminTables['goal_programs'] = chain({
      data: {
        id: 'gp-1',
        starts_on: '2020-01-01', // well in the past → deterministic clamp
        monthly_award_cents: 50000,
        currency: 'BRL',
        categories: [],
        active: true,
      },
    });
    // metric_definitions / care_log_entries / invoice_items default to empty
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.program).toMatchObject({
      monthlyAwardCents: 50000,
      started: true,
    });
    expect(body).toHaveProperty('months.first', '2020-01');
    expect(body).toHaveProperty('progress');
    expect(body).toHaveProperty('runRate');
  });

  it('returns 500 with no raw DB message when the program query fails', async () => {
    mockRole('clinician');
    adminTables['goal_programs'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
