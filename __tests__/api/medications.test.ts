import { GET } from '../../app/api/medications/route';
import { NextRequest } from 'next/server';
import { ERROR_MESSAGES } from '../../lib/constants';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows } from '../helpers/careTeamMock';

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

describe('GET /api/medications (M3: membership-scoped)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  const createRequest = (token?: string, ip = '127.0.0.1') => {
    const headers = new Headers();
    headers.set('x-forwarded-for', ip);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return new NextRequest('http://localhost/api/medications', {
      method: 'GET',
      headers,
    });
  };

  function mockRole(role: 'owner' | 'caregiver' | 'clinician' | 'recipient') {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({ data: membershipRows(role) });
  }

  it('should return 401 without Authorization header', async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: ERROR_MESSAGES.UNAUTHORIZED });
  });

  it('should return 403 for read-side roles (clinician, recipient)', async () => {
    mockRole('clinician');
    expect((await GET(createRequest('token'))).status).toBe(403);
    mockRole('recipient');
    expect((await GET(createRequest('token'))).status).toBe(403);
  });

  it('should return the recipient-scoped list for a caregiver', async () => {
    mockRole('caregiver');
    adminTables['medication_stocks'] = chain({
      data: [
        { name: 'Olanzapine', daily_dosage: 2 },
        { name: 'Sertraline', daily_dosage: 1 },
      ],
    });

    const res = await GET(createRequest('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      medications: [
        { name: 'Olanzapine', dailyDosage: 2 },
        { name: 'Sertraline', dailyDosage: 1 },
      ],
    });
  });

  it('should allow the owner (admin audit views)', async () => {
    mockRole('owner');
    adminTables['medication_stocks'] = chain({ data: [] });
    const res = await GET(createRequest('token'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ medications: [] });
  });
});
