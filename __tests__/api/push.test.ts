import { NextRequest } from 'next/server';
import { DELETE, POST } from '../../app/api/push/route';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, membershipRows } from '../helpers/careTeamMock';

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

const VALID_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null, // browsers include it; the API ignores it
  keys: { p256dh: 'BPubKey', auth: 'authSecret' },
};

function makeRequest(
  method: 'POST' | 'DELETE',
  body: unknown,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/push', {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function mockMember(
  role: 'owner' | 'caregiver' | 'clinician' | 'recipient' = 'recipient',
) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['care_team_members'] = chain({ data: membershipRows(role) });
  adminTables['push_subscriptions'] = chain({ data: [] });
}

describe('POST /api/push (M15: subscription registry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 401 without a token', async () => {
    const res = await POST(makeRequest('POST', VALID_SUBSCRIPTION, null));
    expect(res.status).toBe(401);
  });

  it('returns 403 without a circle membership', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'stranger' } },
      error: null,
    });
    adminTables['care_team_members'] = chain({ data: [] });
    const res = await POST(makeRequest('POST', VALID_SUBSCRIPTION));
    expect(res.status).toBe(403);
  });

  it('upserts the subscription keyed by endpoint for any member role', async () => {
    mockMember('caregiver');
    const res = await POST(makeRequest('POST', VALID_SUBSCRIPTION));
    expect(res.status).toBe(201);
    expect(adminTables['push_subscriptions'].upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        endpoint: VALID_SUBSCRIPTION.endpoint,
        p256dh: 'BPubKey',
        auth: 'authSecret',
      },
      { onConflict: 'endpoint' },
    );
  });

  it('rejects non-https endpoints and missing keys', async () => {
    mockMember();
    const httpEndpoint = await POST(
      makeRequest('POST', {
        ...VALID_SUBSCRIPTION,
        endpoint: 'http://insecure.example/x',
      }),
    );
    expect(httpEndpoint.status).toBe(400);
    const missingKeys = await POST(
      makeRequest('POST', { endpoint: VALID_SUBSCRIPTION.endpoint }),
    );
    expect(missingKeys.status).toBe(400);
  });
});

describe('DELETE /api/push', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it("removes only the caller's own row for the endpoint", async () => {
    mockMember();
    const res = await DELETE(
      makeRequest('DELETE', { endpoint: VALID_SUBSCRIPTION.endpoint }),
    );
    expect(res.status).toBe(200);
    expect(adminTables['push_subscriptions'].delete).toHaveBeenCalled();
    expect(adminTables['push_subscriptions'].eq).toHaveBeenCalledWith(
      'endpoint',
      VALID_SUBSCRIPTION.endpoint,
    );
    expect(adminTables['push_subscriptions'].eq).toHaveBeenCalledWith(
      'user_id',
      'user-1',
    );
  });

  it('rejects a malformed unsubscribe body', async () => {
    mockMember();
    const res = await DELETE(makeRequest('DELETE', { endpoint: 'not-a-url' }));
    expect(res.status).toBe(400);
  });
});
