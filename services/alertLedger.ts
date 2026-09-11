import { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailAlert } from './email';
import { logger } from './logger';

// Alert delivery ledger (audit A2, 2026-07-22): one alert_events row per
// outbound alert attempt, success or failure. Before this, send outcomes were
// discarded at the call sites — a Resend outage during a PHQ-9 escalation left
// no queryable trace. The ledger is best-effort by design: a ledger failure is
// ERROR-logged but never blocks or fails the alert itself (the alert is the
// safety-critical path, the bookkeeping is not).

export type AlertChannel = 'email' | 'push';
export type AlertOutcome = 'sent' | 'failed';
export type AlertKind =
  | 'metric_alert'
  | 'low_stock'
  | 'low_stock_digest'
  | 'missing_log'
  | 'fill_reminder'
  | 'critical';

export interface AlertEventRecord {
  /** null for platform-level escalations that are not recipient-scoped */
  recipientId: string | null;
  kind: AlertKind;
  channel: AlertChannel;
  /** e-mail address or a user-count summary — service-role-only table */
  target: string;
  outcome: AlertOutcome;
  detail?: string;
  /** YYYY-MM-DD care-day the alert refers to; the cron sent-marker key (A4) */
  alertDate?: string;
}

export async function recordAlertEvent(
  adminDb: SupabaseClient,
  event: AlertEventRecord,
): Promise<void> {
  const { error } = await adminDb.from('alert_events').insert({
    recipient_id: event.recipientId,
    kind: event.kind,
    channel: event.channel,
    target: event.target,
    outcome: event.outcome,
    detail: event.detail ?? null,
    alert_date: event.alertDate ?? null,
  });
  if (error) {
    logger.error(
      'alertLedger: alert_events insert failed',
      {
        action: 'record-alert-event',
        kind: event.kind,
        channel: event.channel,
        outcome: event.outcome,
      },
      error,
    );
  }
}

/**
 * Cron sent-marker (audit A4): whether any channel already delivered this
 * kind of alert to this recipient for this care-day. A re-run (manual
 * trigger, platform retry, future hourly schedule) must not re-send. Fails
 * OPEN on a query error — for a safety alert, a duplicate beats a silently
 * missed one.
 */
export async function hasSentAlertToday(
  adminDb: SupabaseClient,
  recipientId: string,
  kind: AlertKind,
  alertDate: string,
): Promise<boolean> {
  const { data, error } = await adminDb
    .from('alert_events')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('kind', kind)
    .eq('alert_date', alertDate)
    .eq('outcome', 'sent')
    .limit(1);
  if (error) {
    logger.error(
      'alertLedger: sent-marker query failed — proceeding with send',
      { action: 'sent-marker-check', kind },
      error,
    );
    return false;
  }
  return (data ?? []).length > 0;
}

export interface TrackedEmailAlert {
  recipientId: string | null;
  kind: AlertKind;
  to: string;
  subject: string;
  body: string;
  detail?: string;
  alertDate?: string;
  /** A11: one admin copy per rule-fire, not once per addressee */
  ccAdmin?: boolean;
}

/**
 * sendEmailAlert + ledger row. Returns whether the e-mail was accepted, so
 * callers can escalate on failure instead of silently dropping it.
 */
export async function sendTrackedEmailAlert(
  adminDb: SupabaseClient,
  alert: TrackedEmailAlert,
): Promise<boolean> {
  const sent = await sendEmailAlert(
    alert.to,
    alert.subject,
    alert.body,
    alert.ccAdmin ?? true,
  );
  if (!sent) {
    logger.error('alertLedger: alert e-mail delivery failed', {
      action: 'tracked-email-failed',
      kind: alert.kind,
      subject: alert.subject,
    });
  }
  await recordAlertEvent(adminDb, {
    recipientId: alert.recipientId,
    kind: alert.kind,
    channel: 'email',
    target: alert.to,
    outcome: sent ? 'sent' : 'failed',
    detail: alert.detail,
    alertDate: alert.alertDate,
  });
  return sent;
}
