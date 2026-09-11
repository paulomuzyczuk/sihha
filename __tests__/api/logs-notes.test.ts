import { GET } from '../../app/api/logs/notes/route';
import { NextRequest } from 'next/server';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows, RECIPIENT_ROW } from '../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

describe('GET /api/logs/notes (session-note lookup)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const request = (token?: string, query = '?date=2026-07-09') => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '127.0.0.1');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return new NextRequest(`http://localhost/api/logs/notes${query}`, {
      method: 'GET',
      headers,
    });
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
    'returns 403 for the %s role — session notes are the clinician surface',
    async (role) => {
      mockRole(role);
      expect((await GET(request('token'))).status).toBe(403);
    },
  );

  it('returns 400 when the date is missing', async () => {
    mockRole('clinician', 'psychologist');
    expect((await GET(request('token', ''))).status).toBe(400);
  });

  it('returns 400 for an impossible calendar date', async () => {
    mockRole('clinician', 'psychologist');
    expect((await GET(request('token', '?date=2026-13-40'))).status).toBe(400);
  });

  it('returns the psychologist write-up from values.session_feedback_text', async () => {
    mockRole('clinician', 'psychologist');
    adminTables['care_log_entries'] = chain({
      data: { values: { session_feedback_text: 'Sessão de adaptação.' } },
    });

    const res = await GET(request('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      date: '2026-07-09',
      notes: 'Sessão de adaptação.',
    });
    // The query must isolate the caller's own specialist record.
    expect(adminTables['care_log_entries'].eq).toHaveBeenCalledWith(
      'author_profile',
      'psychologist',
    );
    expect(adminTables['care_log_entries'].eq).toHaveBeenCalledWith(
      'author_role',
      'clinician',
    );
  });

  it('returns notes: null when no entry exists for that date', async () => {
    mockRole('clinician', 'psychologist');
    adminTables['care_log_entries'] = chain({ data: null });
    const res = await GET(request('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: '2026-07-09', notes: null });
  });

  it('returns notes: null when the entry has no feedback metric', async () => {
    mockRole('clinician', 'psychologist');
    adminTables['care_log_entries'] = chain({ data: { values: {} } });
    const res = await GET(request('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: '2026-07-09', notes: null });
  });

  it('reads a psychiatrist from values.appointment_feedback_text, scoped to psychiatry', async () => {
    mockRole('clinician', 'psychiatrist');
    adminTables['care_log_entries'] = chain({
      data: { values: { appointment_feedback_text: 'Consulta de retorno.' } },
    });
    const res = await GET(request('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      date: '2026-07-09',
      notes: 'Consulta de retorno.',
    });
    // A psychiatrist never reads the psychologist's record.
    expect(adminTables['care_log_entries'].eq).toHaveBeenCalledWith(
      'author_profile',
      'psychiatrist',
    );
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
