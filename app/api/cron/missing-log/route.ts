import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { getAlertRecipientEmails } from '../../../../services/careTeam';
import { localDate } from '../../../../services/dynamicLog';
import { emailText, sendEmailAlert } from '../../../../services/email';
import { logger } from '../../../../services/logger';

// Missing-log check, config-driven (M3): iterates active care recipients
// with a configured missing_log_hour and alerts when no entry exists for the
// recipient-local calendar date. The Vercel cron fires once daily (Hobby
// plan limit), so the configured hour is honored as "the deadline the daily
// run checks against" — recipients in timezones far from the cron schedule
// need an hourly cron (Pro) to be checked at their exact local hour.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminDb = getAdminDbClient();

  const { data: configs, error: configError } = await adminDb
    .from('alert_configs')
    .select(
      'recipient_id, missing_log_hour, care_recipients!inner(id, display_name, timezone, active)',
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

  const results: Array<{ recipient: string; sent: boolean; date: string }> = [];

  for (const config of (configs ?? []) as unknown as Array<{
    recipient_id: string;
    missing_log_hour: number;
    care_recipients: { id: string; display_name: string; timezone: string };
  }>) {
    const recipient = config.care_recipients;
    const today = localDate(recipient.timezone);

    const { count } = await adminDb
      .from('care_log_entries')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', config.recipient_id)
      .eq('log_date', today);

    if ((count ?? 0) > 0) {
      logger.info('cron/missing-log: log found, skipping alert', {
        route: '/api/cron/missing-log',
        action: 'skip',
        date: today,
      });
      continue;
    }

    const emails = await getAlertRecipientEmails(adminDb, config.recipient_id);
    let sent = false;
    for (const email of emails) {
      sent =
        (await sendEmailAlert(
          email,
          emailText('email.missingLogSubject'),
          emailText('email.missingLogBody', {
            date: today,
            name: recipient.display_name,
          }),
        )) || sent;
    }

    logger.info('cron/missing-log: alert dispatched', {
      route: '/api/cron/missing-log',
      action: 'alert-sent',
      date: today,
      recipients: emails.length,
      sent,
    });
    results.push({ recipient: recipient.display_name, sent, date: today });
  }

  return NextResponse.json({ checked: configs?.length ?? 0, alerts: results });
}
