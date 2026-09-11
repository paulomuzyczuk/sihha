import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminDbClient } from '../../../../services/db';
import { localDate, localWeekdayMon0 } from '../../../../services/dynamicLog';
import {
  resolveResponsibleParty,
  responsiblePartyLogged,
} from '../../../../services/shiftSchedule';
import { displayDate } from '../../../../services/dateUtils';
import { emailText } from '../../../../services/email';
import {
  recordAlertEvent,
  sendTrackedEmailAlert,
} from '../../../../services/alertLedger';
import { shouldDispatchDailyAlert } from '../../../../services/cronSchedule';
import { sendPushToUsers } from '../../../../services/webPush';
import { isValidCronRequest } from '../../../../services/cronAuth';
import { logger } from '../../../../services/logger';

// Fill-reminder cron (M15, shift-aware): at the recipient-local deadline (daily
// Vercel cron 01:00 UTC = 21:00 America/Campo_Grande) it nudges whoever is
// RESPONSIBLE for today's log (care_shift_defaults/overrides) if they haven't
// logged yet — by web push and e-mail, to the responsible person themselves.
// The copy varies by their role (therapist visit vs recipient self check-in).
// Shares the responsible-party resolver with the missing-log alert, so the two
// never disagree about whose turn it is. fill_reminder_hour is the deadline
// hour (null = reminders off); the shared A4 gate honors it and the
// alert_events sent-marker makes re-runs idempotent.

interface ReminderConfig {
  recipient_id: string;
  fill_reminder_hour: number;
  care_recipients: { id: string; display_name: string; timezone: string };
}

interface ReminderResult {
  recipient: string;
  role: string;
  date: string;
  emails: number;
  pushes: number;
}

async function remindIfPending(
  adminDb: SupabaseClient,
  config: ReminderConfig,
): Promise<ReminderResult | null> {
  const recipient = config.care_recipients;
  const today = localDate(recipient.timezone);
  const weekday = localWeekdayMon0(recipient.timezone);

  const dispatchable = await shouldDispatchDailyAlert(adminDb, {
    recipientId: config.recipient_id,
    timezone: recipient.timezone,
    deadlineHour: config.fill_reminder_hour,
    kind: 'fill_reminder',
    today,
  });
  if (!dispatchable) return null; // before the deadline, or already sent

  const responsible = await resolveResponsibleParty(
    adminDb,
    config.recipient_id,
    today,
    weekday,
  );
  if (!responsible) return null;
  if (
    await responsiblePartyLogged(
      adminDb,
      config.recipient_id,
      today,
      responsible.userId,
    )
  ) {
    return null;
  }

  const isCaregiver = responsible.role === 'caregiver';
  const subject = emailText(
    isCaregiver
      ? 'email.fillReminderCaregiverSubject'
      : 'email.fillReminderRecipientSubject',
  );
  const body = emailText(
    isCaregiver
      ? 'email.fillReminderCaregiverBody'
      : 'email.fillReminderRecipientBody',
    { name: recipient.display_name, date: displayDate(today) },
  );

  const emailed =
    responsible.email &&
    (await sendTrackedEmailAlert(adminDb, {
      recipientId: config.recipient_id,
      kind: 'fill_reminder',
      to: responsible.email,
      subject,
      body,
      detail: responsible.role,
      alertDate: today,
    }))
      ? 1
      : 0;
  const pushes = await sendPushToUsers(adminDb, [responsible.userId], {
    title: subject,
    body,
    url: '/dashboard',
  });
  await recordAlertEvent(adminDb, {
    recipientId: config.recipient_id,
    kind: 'fill_reminder',
    channel: 'push',
    target: `user ${responsible.userId}`,
    outcome: pushes > 0 ? 'sent' : 'failed',
    detail: `${pushes} devices accepted`,
    alertDate: today,
  });
  return {
    recipient: recipient.display_name,
    role: responsible.role,
    date: today,
    emails: emailed,
    pushes,
  };
}

// A12: bound the function budget explicitly. Every outbound call inside is
// individually capped at 10s (withOutboundTimeout), and the A4 sent-markers
// make a re-run after a hard stop resume where it left off.
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminDb = getAdminDbClient();
  const { data: configs, error: configError } = await adminDb
    .from('alert_configs')
    .select(
      'recipient_id, fill_reminder_hour, care_recipients!inner(id, display_name, timezone, active)',
    )
    .not('fill_reminder_hour', 'is', null)
    .eq('care_recipients.active', true);
  if (configError) {
    logger.error(
      'cron/fill-reminder: alert_configs query failed',
      { route: '/api/cron/fill-reminder', action: 'config-lookup' },
      configError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const reminders: ReminderResult[] = [];
  for (const config of (configs ?? []) as unknown as ReminderConfig[]) {
    const result = await remindIfPending(adminDb, config);
    if (!result) continue;
    logger.info('cron/fill-reminder: reminder dispatched', {
      route: '/api/cron/fill-reminder',
      action: 'remind',
      date: result.date,
      role: result.role,
      emails: result.emails,
      pushes: result.pushes,
    });
    reminders.push(result);
  }

  return NextResponse.json({ checked: configs?.length ?? 0, reminders });
}
