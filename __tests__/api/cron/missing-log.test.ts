import { DEFAULT_LOCALE, translate } from '../../../lib/i18n/dictionaries';
import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/cron/missing-log/route';
import { localDate } from '../../../services/dynamicLog';
import { chain } from '../../helpers/careTeamMock';

const mockSendEmail = jest.fn();
jest.mock('../../../services/email', () => ({
  // Real emailText so subject/body assertions cover the localized templates
  emailText: jest.requireActual('../../../services/email').emailText,
  sendEmailAlert: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockGetUserById = jest.fn();
const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    auth: { admin: { getUserById: mockGetUserById } },
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const CONFIG_ROW = {
  recipient_id: 'recipient-1',
  missing_log_hour: 21,
  last_missing_log_alert_date: null,
  care_recipients: {
    id: 'recipient-1',
    display_name: 'Alex Doe',
    timezone: 'America/Manaus',
    active: true,
  },
};

function makeRequest(secret: string | null = 'cron-secret') {
  const headers: Record<string, string> = {};
  if (secret !== null) headers['Authorization'] = `Bearer ${secret}`;
  return new NextRequest('http://localhost/api/cron/missing-log', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/missing-log (M3: config-driven)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    process.env.CRON_SECRET = 'cron-secret';
    process.env.ADMIN_EMAIL = 'admin-fallback@example.com';
    mockSendEmail.mockResolvedValue(true);
  });

  it('returns 401 without the cron secret', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
    expect((await GET(makeRequest('wrong'))).status).toBe(401);
  });

  it('returns 401 for the literal "Bearer undefined" when CRON_SECRET is unset (A1 regression)', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(makeRequest('undefined'))).status).toBe(401);
  });

  it('skips recipients that already logged today', async () => {
    adminTables['alert_configs'] = chain({ data: [CONFIG_ROW] });
    adminTables['care_log_entries'] = chain({ count: 1 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('alerts flagged members plus the admin fallback when the log is missing', async () => {
    adminTables['alert_configs'] = chain({ data: [CONFIG_ROW] });
    adminTables['care_log_entries'] = chain({ count: 0 });
    adminTables['care_team_members'] = chain({
      data: [{ user_id: 'member-1' }],
    });
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'caregiver@example.com' } },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].sent).toBe(true);

    const destinations = mockSendEmail.mock.calls.map((call) => call[0]);
    expect(destinations).toContain('caregiver@example.com');
    expect(destinations).toContain('admin-fallback@example.com');
    expect(mockSendEmail.mock.calls[0][1]).toBe(
      translate(DEFAULT_LOCALE, 'email.missingLogSubject'),
    );
    expect(mockSendEmail.mock.calls[0][2]).toContain('Alex Doe');
  });

  it('does not re-send when already alerted today (idempotency)', async () => {
    const today = localDate('America/Manaus');
    adminTables['alert_configs'] = chain({
      data: [{ ...CONFIG_ROW, last_missing_log_alert_date: today }],
    });
    adminTables['care_log_entries'] = chain({ count: 0 });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.alerts).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('CCs the admin only on the first send when several members are alerted for the same missed-log event', async () => {
    adminTables['alert_configs'] = chain({ data: [CONFIG_ROW] });
    adminTables['care_log_entries'] = chain({ count: 0 });
    adminTables['care_team_members'] = chain({
      data: [{ user_id: 'member-1' }, { user_id: 'member-2' }],
    });
    mockGetUserById.mockImplementation((userId: string) =>
      Promise.resolve({
        data: { user: { email: `${userId}@example.com` } },
      }),
    );

    await GET(makeRequest());

    // 2 flagged members + the admin fallback appended by getAlertRecipientEmails.
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockSendEmail.mock.calls[0][3]).toBe(true);
    expect(mockSendEmail.mock.calls[1][3]).toBe(false);
    expect(mockSendEmail.mock.calls[2][3]).toBe(false);
  });

  it('falls back to the admin e-mail when no member is flagged', async () => {
    adminTables['alert_configs'] = chain({ data: [CONFIG_ROW] });
    adminTables['care_log_entries'] = chain({ count: 0 });
    adminTables['care_team_members'] = chain({ data: [] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('admin-fallback@example.com');
  });

  it('does nothing when no recipient has the alert configured', async () => {
    adminTables['alert_configs'] = chain({ data: [] });
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 500 when the config query fails', async () => {
    adminTables['alert_configs'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
