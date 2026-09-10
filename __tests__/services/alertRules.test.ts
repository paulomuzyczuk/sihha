import { SupabaseClient } from '@supabase/supabase-js';
import { chain } from '../helpers/careTeamMock';
import {
  createAlertRule,
  evaluateComparator,
  listAlertRules,
  resolveRuleRecipientEmails,
  updateAlertRule,
} from '../../services/alertRules';

const mockGetAlertRecipientEmails = jest.fn();
jest.mock('../../services/careTeam', () => ({
  getAlertRecipientEmails: (...args: unknown[]) =>
    mockGetAlertRecipientEmails(...args),
}));

describe('evaluateComparator', () => {
  it.each([
    ['gte', 5, 5, true],
    ['gte', 6, 5, true],
    ['gte', 4, 5, false],
    ['lte', 5, 5, true],
    ['lte', 4, 5, true],
    ['lte', 6, 5, false],
    ['eq', 5, 5, true],
    ['eq', 5.0001, 5, false],
  ])(
    '%s: %d vs threshold %d -> %s',
    (comparator, value, threshold, expected) => {
      expect(
        evaluateComparator(
          comparator as 'gte' | 'lte' | 'eq',
          value,
          threshold,
        ),
      ).toBe(expected);
    },
  );
});

describe('listAlertRules', () => {
  it('returns the recipient rows as-is from metric_alert_rules', async () => {
    const rows = [{ id: 'rule-1', recipient_id: 'recipient-1' }];
    const db = {
      from: () => chain({ data: rows }),
    } as unknown as SupabaseClient;

    await expect(listAlertRules(db, 'recipient-1')).resolves.toEqual(rows);
  });
});

describe('createAlertRule', () => {
  it('inserts a rule scoped to the recipient', async () => {
    const insert = jest.fn(() => chain({ data: { id: 'rule-1' } }));
    const db = { from: () => ({ insert }) } as unknown as SupabaseClient;

    await createAlertRule(db, 'recipient-1', {
      metric_key: 'mood_score',
      comparator: 'lte',
      threshold: 2,
      label: 'Low mood',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'recipient-1',
        metric_key: 'mood_score',
        comparator: 'lte',
        threshold: 2,
        label: 'Low mood',
      }),
    );
  });
});

describe('updateAlertRule', () => {
  it('updates the rule by id', async () => {
    const eq = jest.fn(() => chain({ data: null }));
    const update = jest.fn(() => ({ eq }));
    const db = { from: () => ({ update }) } as unknown as SupabaseClient;

    await updateAlertRule(db, 'rule-1', { active: false });

    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 'rule-1');
  });
});

describe('resolveRuleRecipientEmails', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves explicit per-rule recipients via auth.admin.getUserById', async () => {
    const db = {
      from: () =>
        chain({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }] }),
      auth: {
        admin: {
          getUserById: jest.fn((userId: string) =>
            Promise.resolve({
              data: {
                user: {
                  email:
                    userId === 'user-1' ? 'a@example.com' : 'b@example.com',
                },
              },
            }),
          ),
        },
      },
    } as unknown as SupabaseClient;

    const emails = await resolveRuleRecipientEmails(
      db,
      'rule-1',
      'recipient-1',
    );
    expect(emails).toEqual(['a@example.com', 'b@example.com']);
    expect(mockGetAlertRecipientEmails).not.toHaveBeenCalled();
  });

  it('falls back to getAlertRecipientEmails when the rule has no explicit recipients', async () => {
    mockGetAlertRecipientEmails.mockResolvedValueOnce(['fallback@example.com']);
    const db = {
      from: () => chain({ data: [] }),
      auth: { admin: { getUserById: jest.fn() } },
    } as unknown as SupabaseClient;

    const emails = await resolveRuleRecipientEmails(
      db,
      'rule-1',
      'recipient-1',
    );
    expect(emails).toEqual(['fallback@example.com']);
    expect(mockGetAlertRecipientEmails).toHaveBeenCalledWith(db, 'recipient-1');
  });
});
