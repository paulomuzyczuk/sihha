import { GET } from '../../../app/api/logs/companion-notes/route';
import { NextRequest } from 'next/server';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { resetRateLimiter } from '../../../services/rateLimiter';
import {
  chain,
  membershipRows,
  RECIPIENT_ROW,
} from '../../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

describe('GET /api/logs/companion-notes (therapeutic-companion notes)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const request = (token?: string, query = '') => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '127.0.0.1');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return new NextRequest(
      `http://localhost/api/logs/companion-notes${query}`,
      { method: 'GET', headers },
    );
  };

  function mockRole(
    role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
    clinicalProfile: string | null = null,
  ) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({
      data: membershipRows(role, RECIPIENT_ROW, clinicalProfile),
    });
  }

  it('returns 401 without a token', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it.each(['owner', 'caregiver', 'recipient'] as const)(
    'returns 403 for the %s role — companion notes are a clinical read surface',
    async (role) => {
      mockRole(role);
      expect((await GET(request('token'))).status).toBe(403);
    },
  );

  it.each(['psychologist', 'psychiatrist'] as const)(
    'returns the caregiver notes for the %s profile (both specialists share the surface)',
    async (profile) => {
      mockRole('clinician', profile);
      adminTables['care_log_entries'] = chain({
        data: [
          {
            id: 'n1',
            log_date: '2026-07-29',
            shift_notes: 'Dia tranquilo.',
            created_at: 'b',
          },
        ],
      });
      const res = await GET(request('token'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        notes: [
          {
            id: 'n1',
            logDate: '2026-07-29',
            notes: 'Dia tranquilo.',
            createdAt: 'b',
          },
        ],
      });
      expect(adminTables['care_log_entries'].eq).toHaveBeenCalledWith(
        'author_role',
        'caregiver',
      );
    },
  );

  it('defaults to the recent 15-day window, floor AND ceiling (excludes future dates)', async () => {
    mockRole('clinician', 'psychiatrist');
    adminTables['care_log_entries'] = chain({ data: [] });
    await GET(request('token'));
    const dateRe = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);
    expect(adminTables['care_log_entries'].gte).toHaveBeenCalledWith(
      'log_date',
      dateRe,
    );
    // The ceiling is the regression guard: without it, future-dated entries
    // leaked into the clinician's "last 15 days" view.
    expect(adminTables['care_log_entries'].lte).toHaveBeenCalledWith(
      'log_date',
      dateRe,
    );
  });

  it('scope=all reads exhaustively (no date bounds)', async () => {
    mockRole('clinician', 'psychiatrist');
    adminTables['care_log_entries'] = chain({ data: [] });
    await GET(request('token', '?scope=all'));
    expect(adminTables['care_log_entries'].gte).not.toHaveBeenCalled();
    expect(adminTables['care_log_entries'].lte).not.toHaveBeenCalled();
  });

  it('returns 500 with a generic error when the query fails', async () => {
    mockRole('clinician', 'psychologist');
    adminTables['care_log_entries'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(request('token'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
