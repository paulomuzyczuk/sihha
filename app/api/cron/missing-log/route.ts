import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminDbClient } from '../../../../services/db';
import { getAlertRecipientEmails } from '../../../../services/careTeam';
import { localDate } from '../../../../services/dynamicLog';
import { displayDate } from '../../../../services/dateUtils';
import { emailText, sendEmailAlert } from '../../../../services/email';
import { isValidCronRequest } from '../../../../services/cronAuth';
import { logger } from '../../../../services/logger';

interface MissingLogConfig {
  recipient_id: string;
  missing_log_hour: number;
  last_missing_log_alert_date: string | null;
  care_recipients: { id: string; display_name: string; timezone: string };
}

type AlertResult = { recipient: string; sent: boolean; date: string };

// Missing-log check, config-driven (M3): iterates active care recipients
// with a configured missing_log_hour and alerts when no entry exists for the
// recipient-local calendar date. The Vercel cron fires once daily (Hobby
// plan limit), so the configured hour is honored as "the deadline the daily
// run checks against" — recipients in timezones far from the cron schedule
// need an hourly cron (Pro) to be checked at their exact local hour.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminDb = getAdminDbClient();
  const { data: configs, error: configError } = await adminDb
    .from('alert_configs')
    .select(
      'recipient_id, missing_log_hour, last_missing_log_alert_date, care_recipients!inner(id, display_name, timezone, active)',
    )
    .not('missing_log_hour', 'is', null)
    .eq('care_recipients.active', true);

  if (configError) {
    logger.error(
      'cron/missing-log: alert_configs query failed',
      { route: '/api/cron/missing-log', action: 'config-lookup' },
      configError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const results: AlertResult[] = [];
  for (const config of (configs ?? []) as unknown as MissingLogConfig[]) {
    const result = await checkAndAlertMissingLog(adminDb, config);
    if (result) results.push(result);
  }

  return NextResponse.json({ checked: configs?.length ?? 0, alerts: results });
}

async function checkAndAlertMissingLog(
  adminDb: SupabaseClient,
  config: MissingLogConfig,
): Promise<AlertResult | null> {
  const recipient = config.care_recipients;
  const today = localDate(recipient.timezone);

  if (await hasLoggedToday(adminDb, config.recipient_id, today)) {
    logger.info('cron/missing-log: log found, skipping alert', {
      route: '/api/cron/missing-log',
      action: 'skip',
      date: today,
    });
    return null;
  }

  // Idempotency: a retried or manually re-triggered run on the same
  // recipient-local day must not re-send while the log is still missing.
  if (config.last_missing_log_alert_date === today) {
    logger.info('cron/missing-log: already alerted today, skipping', {
      route: '/api/cron/missing-log',
      action: 'skip-idempotent',
      date: today,
    });
    return null;
  }

  const sent = await dispatchMissingLogAlert(
    adminDb,
    config.recipient_id,
    recipient,
    today,
  );
  logger.info('cron/missing-log: alert dispatched', {
    route: '/api/cron/missing-log',
    action: 'alert-sent',
    date: today,
    sent,
  });
  return { recipient: recipient.display_name, sent, date: today };
}

async function hasLoggedToday(
  adminDb: SupabaseClient,
  recipientId: string,
  today: string,
): Promise<boolean> {
  // The alert watches the therapist's daily log specifically — a
  // self-report or clinician entry must not silence it.
  const { count } = await adminDb
    .from('care_log_entries')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('log_date', today)
    .eq('author_role', 'caregiver');
  return (count ?? 0) > 0;
}

async function dispatchMissingLogAlert(
  adminDb: SupabaseClient,
  recipientId: string,
  recipient: { display_name: string },
  today: string,
): Promise<boolean> {
  const emails = await getAlertRecipientEmails(adminDb, recipientId);
  let sent = false;
  // CC the admin once per rule-fire, not once per addressee.
  for (const [index, email] of emails.entries()) {
    sent =
      (await sendEmailAlert(
        email,
        emailText('email.missingLogSubject'),
        emailText('email.missingLogBody', {
          date: displayDate(today),
          name: recipient.display_name,
        }),
        index === 0,
      )) || sent;
  }
  if (sent) await markMissingLogAlertSent(adminDb, recipientId, today);
  return sent;
}

async function markMissingLogAlertSent(
  adminDb: SupabaseClient,
  recipientId: string,
  today: string,
): Promise<void> {
  const { error } = await adminDb
    .from('alert_configs')
    .update({ last_missing_log_alert_date: today })
    .eq('recipient_id', recipientId);
  if (error) {
    logger.error(
      'cron/missing-log: failed to record alert marker',
      { route: '/api/cron/missing-log', action: 'mark-sent' },
      error,
    );
  }
}
