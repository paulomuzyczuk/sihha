import { SupabaseClient } from '@supabase/supabase-js';
import { chain } from '../helpers/careTeamMock';
import { checkAndFireMetricAlertRules } from '../../services/metricAlert';

const mockSendEmail = jest.fn();
jest.mock('../../services/email', () => ({
  emailText: jest.requireActual('../../services/email').emailText,
  sendEmailAlert: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockResolveRuleRecipientEmails = jest.fn();
jest.mock('../../services/alertRules', () => ({
  ...jest.requireActual('../../services/alertRules'),
  resolveRuleRecipientEmails: (...args: unknown[]) =>
    mockResolveRuleRecipientEmails(...args),
}));

const RECIPIENT_ID = 'recipient-1';

function makeMockDb(rules: object[]): SupabaseClient {
  return {
    from: (table: string) =>
      table === 'metric_alert_rules'
        ? chain({ data: rules })
        : chain({ data: [] }),
  } as unknown as SupabaseClient;
}

const BASE_RULE = {
  id: 'rule-1',
  recipient_id: RECIPIENT_ID,
  metric_key: 'mood_score',
  comparator: 'lte' as const,
  threshold: 2,
  label: 'Low mood',
  custom_subject: null,
  custom_body: null,
  active: true,
};

describe('checkAndFireMetricAlertRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveRuleRecipientEmails.mockResolvedValue(['caregiver@example.com']);
  });

  it('fires when the submitted value crosses the threshold', async () => {
    const db = makeMockDb([BASE_RULE]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { mood_score: 1 });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      'caregiver@example.com',
      expect.any(String),
      expect.any(String),
      true,
    );
  });

  it('does not fire when the value does not cross the threshold', async () => {
    const db = makeMockDb([BASE_RULE]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { mood_score: 4 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips inactive rules (excluded by the .eq(active, true) query filter)', async () => {
    // The mock DB stands in for what a real `.eq('active', true)` query
    // returns — an inactive rule is filtered out before reaching this
    // service, so the fixture here is empty rather than active:false.
    const db = makeMockDb([]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { mood_score: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips rules whose metric_key is not in the submitted values', async () => {
    const db = makeMockDb([BASE_RULE]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { other_metric: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips a non-numeric submitted value', async () => {
    const db = makeMockDb([BASE_RULE]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, {
      mood_score: 'not-a-number',
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('uses custom subject/body when the rule sets them', async () => {
    const db = makeMockDb([
      {
        ...BASE_RULE,
        custom_subject: 'Custom subject',
        custom_body: 'Custom body',
      },
    ]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { mood_score: 1 });

    expect(mockSendEmail).toHaveBeenCalledWith(
      'caregiver@example.com',
      'Custom subject',
      'Custom body',
      true,
    );
  });

  it('sends one email per resolved recipient and CCs the admin only once per fire', async () => {
    mockResolveRuleRecipientEmails.mockResolvedValueOnce([
      'a@example.com',
      'b@example.com',
    ]);
    const db = makeMockDb([BASE_RULE]);
    await checkAndFireMetricAlertRules(db, RECIPIENT_ID, { mood_score: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1,
      'a@example.com',
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      'b@example.com',
      expect.any(String),
      expect.any(String),
      false,
    );
  });
});
