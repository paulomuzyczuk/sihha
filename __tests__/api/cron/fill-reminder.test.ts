import { DEFAULT_LOCALE, translate } from '../../../lib/i18n/dictionaries';
import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/cron/fill-reminder/route';
import { chain } from '../../helpers/careTeamMock';

const mockSendEmail = jest.fn();
jest.mock('../../../services/email', () => ({
  emailText: jest.requireActual('../../../services/email').emailText,
  sendEmailAlert: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockSendPush = jest.fn();
jest.mock('../../../services/webPush', () => ({
  sendPushToUsers: (...args: unknown[]) => mockSendPush(...args),
}));

const mockGetUserById = jest.fn();
const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    auth: { admin: { getUserById: mockGetUserById } },
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

// Freeze the recipient-local clock at 21:00 so the deadline-hour gate (A4) is
// deterministic regardless of when the suite runs.
jest.mock('../../../services/dynamicLog', () => ({
  ...jest.requireActual('../../../services/dynamicLog'),
  localHour: () => 21,
}));

const CONFIG_ROW = {
  recipient_id: 'recipient-1',
  fill_reminder_hour: 21,
  care_recipients: {
    id: 'recipient-1',
    display_name: 'Patient',
    timezone: 'America/Campo_Grande',
    active: true,
  },
};

// The chain mock ignores the .eq('weekday') filter, so the default returns its
// responsible person regardless of the real weekday — deterministic.
function mockShift(opts: {
  override?: { responsible_user_id: string } | null;
  weekly?: { responsible_user_id: string } | null;
  role?: string;
  userId?: string;
  email?: string;
  logged?: boolean;
}) {
  adminTables['alert_configs'] = chain({ data: [CONFIG_ROW] });
  adminTables['care_shift_overrides'] = chain({ data: opts.override ?? null });
  adminTables['care_shift_defaults'] = chain({ data: opts.weekly ?? null });
  adminTables['care_team_members'] = chain({
    data: opts.role ? { role: opts.role } : null,
  });
  adminTables['care_log_entries'] = chain({
    data: opts.logged ? [{ id: 'entry-1' }] : [],
  });
  mockGetUserById.mockResolvedValue({
    data: { user: { email: opts.email ?? 'person@example.com' } },
  });
}

function makeRequest(secret: string | null = 'cron-secret') {
  const headers: Record<string, string> = {};
  if (secret !== null) headers['Authorization'] = `Bearer ${secret}`;
  return new NextRequest('http://localhost/api/cron/fill-reminder', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/fill-reminder (shift-aware, responsible person)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    process.env.CRON_SECRET = 'cron-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    mockSendEmail.mockResolvedValue(true);
    mockSendPush.mockResolvedValue(1);
  });

  it('returns 401 without the cron secret', async () => {
    expect((await GET(makeRequest(null))).status).toBe(401);
    expect((await GET(makeRequest('wrong'))).status).toBe(401);
  });

  it('fails closed when CRON_SECRET is unset — "Bearer undefined" must not authenticate (audit A1)', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(makeRequest('undefined'))).status).toBe(401);
    expect((await GET(makeRequest(null))).status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('nudges the responsible therapist (email + push) when they have not logged', async () => {
    mockShift({
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      email: 'caregiver-1@example.com',
      logged: false,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].role).toBe('caregiver');

    const subject = translate(
      DEFAULT_LOCALE,
      'email.fillReminderCaregiverSubject',
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      'caregiver-1@example.com',
      subject,
      expect.stringContaining('Patient'),
      expect.anything(),
    );
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.anything(),
      ['caregiver-1'],
      expect.objectContaining({ title: subject }),
    );
  });

  it('uses the recipient copy when the responsible person is the recipient', async () => {
    mockShift({
      weekly: { responsible_user_id: 'patient' },
      role: 'recipient',
      email: 'patient@example.com',
      logged: false,
    });
    const body = await (await GET(makeRequest())).json();
    expect(body.reminders[0].role).toBe('recipient');
    expect(mockSendEmail).toHaveBeenCalledWith(
      'patient@example.com',
      translate(DEFAULT_LOCALE, 'email.fillReminderRecipientSubject'),
      expect.any(String),
      expect.anything(),
    );
  });

  it('stays quiet once the responsible person logged', async () => {
    mockShift({
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      logged: true,
    });
    const body = await (await GET(makeRequest())).json();
    expect(body.reminders).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('a date override takes precedence over the weekday default', async () => {
    mockShift({
      override: { responsible_user_id: 'substitute' },
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      email: 'substitute@example.com',
      logged: false,
    });
    await GET(makeRequest());
    expect(mockSendEmail.mock.calls[0][0]).toBe('substitute@example.com');
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.anything(),
      ['substitute'],
      expect.anything(),
    );
  });

  it('skips when no one is on shift for the day', async () => {
    mockShift({ override: null, weekly: null });
    const body = await (await GET(makeRequest())).json();
    expect(body.reminders).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('does nothing when no recipient has the reminder configured', async () => {
    adminTables['alert_configs'] = chain({ data: [] });
    const body = await (await GET(makeRequest())).json();
    expect(body.checked).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 500 when the config query fails', async () => {
    adminTables['alert_configs'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    expect((await GET(makeRequest())).status).toBe(500);
  });

  it('skips a recipient already reminded today — idempotent re-run (audit A4)', async () => {
    mockShift({
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      logged: false,
    });
    adminTables['alert_events'] = chain({ data: [{ id: 'evt-1' }] });

    const body = await (await GET(makeRequest())).json();
    expect(body.reminders).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('records e-mail and push outcomes in the alert_events ledger (audit A4)', async () => {
    mockShift({
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      email: 'caregiver-1@example.com',
      logged: false,
    });
    const events = chain({ data: [] });
    adminTables['alert_events'] = events;

    await GET(makeRequest());

    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'fill_reminder',
        channel: 'email',
        outcome: 'sent',
      }),
    );
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'fill_reminder',
        channel: 'push',
        outcome: 'sent',
      }),
    );
  });

  it('waits for the recipient-local deadline hour (audit A4)', async () => {
    mockShift({
      weekly: { responsible_user_id: 'caregiver-1' },
      role: 'caregiver',
      logged: false,
    });
    // Local clock is frozen at 21:00; a 23:00 deadline has not passed yet.
    adminTables['alert_configs'] = chain({
      data: [{ ...CONFIG_ROW, fill_reminder_hour: 23 }],
    });

    const body = await (await GET(makeRequest())).json();
    expect(body.reminders).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
  });
});
