import { NextRequest } from 'next/server';
import { GET } from '../../app/api/circles/route';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain } from '../helpers/careTeamMock';

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

function makeRequest(token: string | null = 'valid-token'): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/circles', {
    method: 'GET',
    headers,
  });
}

function mockUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
}

describe('GET /api/circles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 without a token', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
  });

  it('lists the memberships as circles with recipient identity only', async () => {
    mockUser();
    adminTables['care_team_members'] = chain({
      data: [
        {
          recipient_id: 'recipient-1',
          role: 'caregiver',
          care_recipients: { display_name: 'Alex Doe', kind: 'human' },
        },
        {
          recipient_id: 'recipient-2',
          role: 'owner',
          care_recipients: { display_name: 'Rex', kind: 'pet' },
        },
      ],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.circles).toEqual([
      {
        recipientId: 'recipient-1',
        role: 'caregiver',
        clinicalProfile: null,
        displayName: 'Alex Doe',
        kind: 'human',
      },
      {
        recipientId: 'recipient-2',
        role: 'owner',
        clinicalProfile: null,
        displayName: 'Rex',
        kind: 'pet',
      },
    ]);
    // The recipient row's geofence must never reach the client through here
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('geo_lat');
    expect(serialized).not.toContain('geo_lng');
  });

  it('returns an empty list for a user with no memberships', async () => {
    mockUser();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).circles).toEqual([]);
  });

  it('returns 500 when the membership query fails', async () => {
    mockUser();
    adminTables['care_team_members'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
