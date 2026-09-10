import { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertRuleRow,
  evaluateComparator,
  resolveRuleRecipientEmails,
} from './alertRules';
import { emailText, sendEmailAlert } from './email';

/**
 * Runtime firing path for admin-configured metric alert rules, called after
 * a log entry is submitted (app/api/logs/route.ts, mirroring
 * checkAndAlertLowStock's fire-and-forget posture). Only active rules whose
 * metric_key is present with a finite numeric value in this submission are
 * evaluated — text/enum/boolean metrics and untouched keys never match.
 */
export async function checkAndFireMetricAlertRules(
  adminDb: SupabaseClient,
  recipientId: string,
  submittedValues: Record<string, unknown>,
): Promise<void> {
  const { data } = await adminDb
    .from('metric_alert_rules')
    .select(
      'id, recipient_id, metric_key, comparator, threshold, label, custom_subject, custom_body, active',
    )
    .eq('recipient_id', recipientId)
    .eq('active', true);

  for (const rule of (data ?? []) as AlertRuleRow[]) {
    const value = submittedValues[rule.metric_key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!evaluateComparator(rule.comparator, value, rule.threshold)) continue;

    await fireRule(adminDb, rule, value);
  }
}

async function fireRule(
  adminDb: SupabaseClient,
  rule: AlertRuleRow,
  value: number,
): Promise<void> {
  const emails = await resolveRuleRecipientEmails(
    adminDb,
    rule.id,
    rule.recipient_id,
  );
  const subject =
    rule.custom_subject ??
    emailText('email.metricAlertSubject', { label: rule.label });
  const body =
    rule.custom_body ??
    emailText('email.metricAlertBody', {
      label: rule.label,
      metricKey: rule.metric_key,
      value: String(value),
    });

  // One rule-fire, one email per resolved recipient — CC the admin at most
  // once per fire (A11), not once per addressee.
  for (const [index, email] of emails.entries()) {
    await sendEmailAlert(email, subject, body, index === 0);
  }
}
