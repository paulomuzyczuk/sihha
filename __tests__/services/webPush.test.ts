import { SupabaseClient } from '@supabase/supabase-js';
import { chain } from '../helpers/careTeamMock';

const mockSendNotification = jest.fn();
const mockSetVapidDetails = jest.fn();
jest.mock('web-push', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
}));

import { sendPushToUsers, webPushConfigured } from '../../services/webPush';
import { logger } from '../../services/logger';

const adminTables: Record<string, ReturnType<typeof chain>> = {};
const adminDb = {
  from: (table: string) => adminTables[table] ?? chain({ data: [] }),
} as unknown as SupabaseClient;

const SUBSCRIPTION_ROWS = [
  {
    id: 'sub-1',
    user_id: 'user-1',
    endpoint: 'https://push.example/a',
    p256dh: 'k1',
    auth: 'a1',
  },
  {
    id: 'sub-2',
    user_id: 'user-1',
    endpoint: 'https://push.example/b',
    p256dh: 'k2',
    auth: 'a2',
  },
];

const MESSAGE = { title: 'Lembrete', body: 'Preencha o formulário', url: '/' };

describe('sendPushToUsers (M15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    process.env.ADMIN_EMAIL = 'ops@example.com';
    mockSendNotification.mockResolvedValue(undefined);
  });

  it('counts a hung push service as a failed send after the outbound timeout (audit A12)', async () => {
    jest.useFakeTimers();
    adminTables['push_subscriptions'] = chain({
      data: [SUBSCRIPTION_ROWS[0]],
    });
    mockSendNotification.mockReturnValueOnce(new Promise(() => {}));

    const pending = sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    await jest.advanceTimersByTimeAsync(10_001);
    await expect(pending).resolves.toBe(0);
    jest.useRealTimers();
  });

  it('ERROR-logs a failed push_events insert instead of swallowing it (audit A22)', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    adminTables['push_subscriptions'] = chain({
      data: [SUBSCRIPTION_ROWS[0]],
    });
    adminTables['push_events'] = chain({
      data: null,
      error: { message: 'insert boom' },
    });

    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);

    // The push itself still counts — telemetry bookkeeping must not
    // change delivery semantics
    expect(sent).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('push_events'),
      expect.objectContaining({ action: 'record-sent' }),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  it('logs "no subscribed devices" so a zero send is explainable (audit A22)', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    adminTables['push_subscriptions'] = chain({ data: [] });

    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);

    expect(sent).toBe(0);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('no subscribed devices'),
      expect.objectContaining({ action: 'no-devices', userCount: 1 }),
    );
    infoSpy.mockRestore();
  });

  it('reports configuration from the VAPID env pair', () => {
    expect(webPushConfigured()).toBe(true);
    delete process.env.VAPID_PRIVATE_KEY;
    expect(webPushConfigured()).toBe(false);
  });

  it('is a quiet no-op without VAPID keys (e-mail still covers reminders)', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    expect(sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('does not query at all for an empty user list', async () => {
    adminTables['push_subscriptions'] = chain({ data: SUBSCRIPTION_ROWS });
    const sent = await sendPushToUsers(adminDb, [], MESSAGE);
    expect(sent).toBe(0);
    expect(adminTables['push_subscriptions'].select).not.toHaveBeenCalled();
  });

  it('sends the payload (with a per-send notificationId) to every subscription', async () => {
    adminTables['push_subscriptions'] = chain({ data: SUBSCRIPTION_ROWS });
    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    expect(sent).toBe(2);
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      'mailto:ops@example.com',
      'public-key',
      'private-key',
    );

    const [subscription, payloadStr] = mockSendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'k1', auth: 'a1' },
    });
    const payload = JSON.parse(payloadStr as string);
    expect(payload).toMatchObject(MESSAGE);
    expect(payload.notificationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('records a "sent" push_event per accepted send (for open-rate stats)', async () => {
    adminTables['push_subscriptions'] = chain({ data: [SUBSCRIPTION_ROWS[0]] });
    const events = chain({ data: null });
    adminTables['push_events'] = events;

    await sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        kind: 'fill_reminder',
        event: 'sent',
      }),
    );
    // notification_id matches the one delivered in the payload
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1] as string);
    expect(events.insert.mock.calls[0][0].notification_id).toBe(
      payload.notificationId,
    );
  });

  it('prunes a subscription the push service reports gone (410)', async () => {
    adminTables['push_subscriptions'] = chain({ data: SUBSCRIPTION_ROWS });
    mockSendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce(undefined);
    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    expect(sent).toBe(1);
    expect(adminTables['push_subscriptions'].delete).toHaveBeenCalled();
    expect(adminTables['push_subscriptions'].eq).toHaveBeenCalledWith(
      'id',
      'sub-1',
    );
  });

  it('keeps the subscription on transient send errors', async () => {
    adminTables['push_subscriptions'] = chain({
      data: [SUBSCRIPTION_ROWS[0]],
    });
    mockSendNotification.mockRejectedValueOnce({ statusCode: 500 });
    const sent = await sendPushToUsers(adminDb, ['user-1'], MESSAGE);
    expect(sent).toBe(0);
    expect(adminTables['push_subscriptions'].delete).not.toHaveBeenCalled();
  });
});
