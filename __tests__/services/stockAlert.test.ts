import { SupabaseClient } from '@supabase/supabase-js';
import { checkAndAlertLowStock } from '../../services/stockAlert';
import { chain } from '../helpers/careTeamMock';

const mockSendEmail = jest.fn();
jest.mock('../../services/email', () => ({
  // Real emailText so subject/body assertions cover the localized templates
  emailText: jest.requireActual('../../services/email').emailText,
  sendEmailAlert: (...args: unknown[]) => mockSendEmail(...args),
}));

// Fixed reference: 2026-05-22 noon UTC
const FIXED_NOW = new Date('2026-05-22T12:00:00Z').getTime();
const RECIPIENT_ID = 'recipient-1';

interface MockDbOptions {
  lowStockDays?: number | null;
  alertMembers?: Array<{ user_id: string; email: string }>;
}

function makeMockDb(
  stockRows: object[],
  { lowStockDays = 5, alertMembers = [] }: MockDbOptions = {},
): SupabaseClient {
  const tables: Record<string, ReturnType<typeof chain>> = {
    alert_configs: chain({ data: { low_stock_days: lowStockDays } }),
    medication_stocks: chain({ data: stockRows }),
    care_team_members: chain({
      data: alertMembers.map((m) => ({ user_id: m.user_id })),
    }),
  };
  const emailByUser = new Map(alertMembers.map((m) => [m.user_id, m.email]));
  return {
    from: (table: string) => tables[table] ?? chain({ data: [] }),
    auth: {
      admin: {
        getUserById: jest.fn((userId: string) =>
          Promise.resolve({
            data: { user: { email: emailByUser.get(userId) } },
          }),
        ),
      },
    },
  } as unknown as SupabaseClient;
}

const LOW_STOCK = {
  id: 'stock-1',
  name: 'Olanzapine',
  package_start_date: '2026-05-12', // 10 days before FIXED_NOW → 5 days remaining
  total_pills_in_package: 30,
  daily_dosage: 2,
};

describe('checkAndAlertLowStock (M3: per-recipient config + alert members)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAIL = 'admin@example.com';
  });

  it('alerts at exactly the configured threshold (5 days remaining)', async () => {
    const db = makeMockDb([LOW_STOCK]);
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      'admin@example.com',
      '[sihha] Estoque baixo: Olanzapine',
      expect.stringContaining('Olanzapine'),
    );
  });

  it('does not alert above the threshold (6 days remaining)', async () => {
    const db = makeMockDb([
      { ...LOW_STOCK, id: 'stock-2', package_start_date: '2026-05-13' },
    ]);
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('honors a custom per-recipient threshold', async () => {
    // 6 days remaining alerts when the recipient's threshold is 7
    const db = makeMockDb(
      [{ ...LOW_STOCK, package_start_date: '2026-05-13' }],
      { lowStockDays: 7 },
    );
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('does nothing when low-stock alerting is off (null threshold)', async () => {
    const db = makeMockDb([LOW_STOCK], { lowStockDays: null });
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('e-mails flagged members and the admin fallback', async () => {
    const db = makeMockDb([LOW_STOCK], {
      alertMembers: [{ user_id: 'member-1', email: 'caregiver@example.com' }],
    });
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);

    const destinations = mockSendEmail.mock.calls.map((call) => call[0]);
    expect(destinations).toEqual([
      'caregiver@example.com',
      'admin@example.com',
    ]);
  });

  it('suppresses a repeat alert within the cooldown window', async () => {
    const oneHourAgo = new Date(FIXED_NOW - 60 * 60 * 1000).toISOString();
    const db = makeMockDb([
      { ...LOW_STOCK, last_low_stock_alert_at: oneHourAgo },
    ]);
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('re-alerts once the cooldown window has elapsed', async () => {
    const twoDaysAgo = new Date(
      FIXED_NOW - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = makeMockDb([
      { ...LOW_STOCK, last_low_stock_alert_at: twoDaysAgo },
    ]);
    await checkAndAlertLowStock(db, RECIPIENT_ID, FIXED_NOW);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
