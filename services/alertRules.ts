import { SupabaseClient } from '@supabase/supabase-js';
import { getAlertRecipientEmails } from './careTeam';

export type Comparator = 'gte' | 'lte' | 'eq';

export interface AlertRuleRow {
  id: string;
  recipient_id: string;
  metric_key: string;
  comparator: Comparator;
  threshold: number;
  label: string;
  custom_subject: string | null;
  custom_body: string | null;
  active: boolean;
}

export interface AlertRuleInput {
  metric_key: string;
  comparator: Comparator;
  threshold: number;
  label: string;
  custom_subject?: string | null;
  custom_body?: string | null;
  active?: boolean;
}

/** Pure threshold check — the runtime firing decision in metricAlert.ts. */
export function evaluateComparator(
  comparator: Comparator,
  value: number,
  threshold: number,
): boolean {
  switch (comparator) {
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
  }
}

/** Every alert rule configured for a circle (admin console list view). */
export async function listAlertRules(
  adminDb: SupabaseClient,
  recipientId: string,
): Promise<AlertRuleRow[]> {
  const { data } = await adminDb
    .from('metric_alert_rules')
    .select(
      'id, recipient_id, metric_key, comparator, threshold, label, custom_subject, custom_body, active',
    )
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: true });
  return (data ?? []) as AlertRuleRow[];
}

export async function createAlertRule(
  adminDb: SupabaseClient,
  recipientId: string,
  input: AlertRuleInput,
): Promise<{ error: unknown }> {
  const { error } = await adminDb.from('metric_alert_rules').insert({
    recipient_id: recipientId,
    metric_key: input.metric_key,
    comparator: input.comparator,
    threshold: input.threshold,
    label: input.label,
    custom_subject: input.custom_subject ?? null,
    custom_body: input.custom_body ?? null,
    active: input.active ?? true,
  });
  return { error };
}

export async function updateAlertRule(
  adminDb: SupabaseClient,
  ruleId: string,
  changes: Partial<AlertRuleInput>,
): Promise<{ error: unknown }> {
  const { error } = await adminDb
    .from('metric_alert_rules')
    .update(changes)
    .eq('id', ruleId);
  return { error };
}

/**
 * A rule's own metric_alert_rule_recipients when set, otherwise the
 * circle's flagged alert members + admin fallback (getAlertRecipientEmails).
 */
export async function resolveRuleRecipientEmails(
  adminDb: SupabaseClient,
  ruleId: string,
  recipientId: string,
): Promise<string[]> {
  const { data: ruleRecipients } = await adminDb
    .from('metric_alert_rule_recipients')
    .select('user_id')
    .eq('rule_id', ruleId);

  if (!ruleRecipients || ruleRecipients.length === 0) {
    return getAlertRecipientEmails(adminDb, recipientId);
  }

  const emails: string[] = [];
  for (const row of ruleRecipients as { user_id: string }[]) {
    const { data } = await adminDb.auth.admin.getUserById(row.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}
