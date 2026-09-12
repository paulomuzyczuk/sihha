import { NextRequest } from 'next/server';
import { GET } from '../../app/api/goals/series/route';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

// /api/goals/series (goals-run-rate port): per-sub-goal trend data for the
// dashboard's 8-week attainment view. Same auth/scoping contract as
// /api/goals — the math itself is covered in __tests__/services/goalSeries.test.ts.

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
  const url = new URL('http://localhost/api/goals/series');
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

describe('GET /api/goals/series (membership-scoped, all circle roles)', () => {
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
    mockRole('caregiver');
    const res = await GET(makeRequest('valid-token', 'recipient-2'));
    expect(res.status).toBe(403);
  });

  it('returns month:null and an empty series when there is no goal program', async () => {
    mockRole('recipient');
    adminTables['goal_programs'] = chain({ data: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ month: null, series: [] });
  });

  it('scopes the goal_programs read to the caller’s own recipient', async () => {
    mockRole('caregiver');
    adminTables['goal_programs'] = chain({ data: null });
    await GET(makeRequest());
    expect(adminTables['goal_programs'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
    expect(adminTables['goal_programs'].eq).toHaveBeenCalledWith(
      'active',
      true,
    );
  });

  it('assembles a per-sub-goal series payload for an active program', async () => {
    mockRole('owner');
    adminTables['goal_programs'] = chain({
      data: {
        id: 'gp-1',
        starts_on: '2020-01-01', // well in the past → deterministic clamp
        monthly_award_cents: 50000,
        currency: 'BRL',
        categories: [
          {
            key: 'sleep',
            label: 'Sono',
            weight: 1,
            metrics: [{ key: 'sleep', rule: 'min_hours', target: 8 }],
          },
        ],
        active: true,
      },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('month');
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.series).toHaveLength(1);
    expect(body.series[0]).toMatchObject({
      uid: 'sleep::min_hours::',
    });
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
