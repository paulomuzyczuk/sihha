import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/push/event/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { chain } from '../../helpers/careTeamMock';

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

// The route validates notificationId as a UUID (zod .uuid()) — this is a
// synthetic, obviously-fake fixture (never a real recipient/user id).
const NOTIF = '11111111-1111-4111-8111-111111111111';

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/push/event (push analytics)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
  });

  it('returns 400 for an invalid event or a non-uuid id', async () => {
    expect(
      (await POST(req({ notificationId: NOTIF, event: 'clicked' }))).status,
    ).toBe(400);
    expect(
      (await POST(req({ notificationId: 'nope', event: 'opened' }))).status,
    ).toBe(400);
  });

  it('records the event, attributed to the user on the originating "sent" row', async () => {
    const events = chain({ data: { user_id: 'u1', kind: 'fill_reminder' } });
    adminTables['push_events'] = events;

    const res = await POST(req({ notificationId: NOTIF, event: 'opened' }));
    expect(res.status).toBe(201);
    expect(events.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: NOTIF,
        user_id: 'u1',
        kind: 'fill_reminder',
        event: 'opened',
      }),
      expect.anything(),
    );
  });

  it('is a no-op (202) for an unknown notificationId', async () => {
    adminTables['push_events'] = chain({ data: null });
    const res = await POST(req({ notificationId: NOTIF, event: 'displayed' }));
    expect(res.status).toBe(202);
  });
});
