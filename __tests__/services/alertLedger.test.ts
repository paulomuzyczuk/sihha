import { SupabaseClient } from '@supabase/supabase-js';
import {
  hasSentAlertToday,
  recordAlertEvent,
  sendTrackedEmailAlert,
} from '../../services/alertLedger';
import { chain } from '../helpers/careTeamMock';

const mockSendEmail = jest.fn();
jest.mock('../../services/email', () => ({
  sendEmailAlert: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockLoggerError = jest.fn();
jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

function makeDb(tables: Record<string, ReturnType<typeof chain>>) {
  return {
    from: (table: string) => tables[table] ?? chain({ data: [] }),
  } as unknown as SupabaseClient;
}

describe('recordAlertEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts one alert_events row with the snake_case columns', async () => {
    const events = chain({ data: null });
    await recordAlertEvent(makeDb({ alert_events: events }), {
      recipientId: 'recipient-1',
      kind: 'metric_alert',
      channel: 'email',
      target: 'therapist@example.com',
      outcome: 'sent',
      detail: 'PHQ-9 item 9',
      alertDate: '2026-07-22',
    });

    expect(events.insert).toHaveBeenCalledWith({
      recipient_id: 'recipient-1',
      kind: 'metric_alert',
      channel: 'email',
      target: 'therapist@example.com',
      outcome: 'sent',
      detail: 'PHQ-9 item 9',
      alert_date: '2026-07-22',
    });
  });

  it('logs at ERROR and does not throw when the insert fails', async () => {
    const events = chain({ data: null, error: { message: 'insert boom' } });
    await expect(
      recordAlertEvent(makeDb({ alert_events: events }), {
        recipientId: null,
        kind: 'critical',
        channel: 'email',
        target: 'admin@example.com',
        outcome: 'failed',
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe('sendTrackedEmailAlert', () => {
  beforeEach(() => jest.clearAllMocks());

  const alert = {
    recipientId: 'recipient-1',
    kind: 'low_stock' as const,
    to: 'caregiver@example.com',
    subject: 'Low stock',
    body: 'Olanzapine is low',
    detail: 'Olanzapine',
    alertDate: '2026-07-22',
  };

  it('records outcome "sent" and returns true on success', async () => {
    mockSendEmail.mockResolvedValue(true);
    const events = chain({ data: null });

    const ok = await sendTrackedEmailAlert(
      makeDb({ alert_events: events }),
      alert,
    );

    expect(ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      'caregiver@example.com',
      'Low stock',
      'Olanzapine is low',
      true,
    );
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'sent', channel: 'email' }),
    );
  });

  it('records outcome "failed", logs at ERROR, and returns false on failure', async () => {
    mockSendEmail.mockResolvedValue(false);
    const events = chain({ data: null });

    const ok = await sendTrackedEmailAlert(
      makeDb({ alert_events: events }),
      alert,
    );

    expect(ok).toBe(false);
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('still returns the send outcome when the ledger insert fails', async () => {
    mockSendEmail.mockResolvedValue(true);
    const events = chain({ data: null, error: { message: 'ledger down' } });
    const ok = await sendTrackedEmailAlert(
      makeDb({ alert_events: events }),
      alert,
    );
    expect(ok).toBe(true);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe('hasSentAlertToday (A4 cron sent-marker)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is true when a sent row exists for (recipient, kind, date)', async () => {
    const events = chain({ data: [{ id: 'evt-1' }] });
    await expect(
      hasSentAlertToday(
        makeDb({ alert_events: events }),
        'recipient-1',
        'missing_log',
        '2026-07-23',
      ),
    ).resolves.toBe(true);
  });

  it('is false when no marker exists', async () => {
    const events = chain({ data: [] });
    await expect(
      hasSentAlertToday(
        makeDb({ alert_events: events }),
        'recipient-1',
        'missing_log',
        '2026-07-23',
      ),
    ).resolves.toBe(false);
  });

  it('fails OPEN (false) with an ERROR log when the query fails — a duplicate alert beats a silently missed one', async () => {
    const events = chain({ data: null, error: { message: 'query boom' } });
    await expect(
      hasSentAlertToday(
        makeDb({ alert_events: events }),
        'recipient-1',
        'fill_reminder',
        '2026-07-23',
      ),
    ).resolves.toBe(false);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
