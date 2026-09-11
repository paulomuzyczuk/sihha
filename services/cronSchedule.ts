import { SupabaseClient } from '@supabase/supabase-js';
import { AlertKind, hasSentAlertToday } from './alertLedger';
import { localHour } from './dynamicLog';
import { logger } from './logger';

// Shared dispatch gate for the daily alert crons (audit A4). Two checks,
// in order:
//
// 1. Deadline hour. alert_configs' missing_log_hour/fill_reminder_hour were
//    previously a null/non-null enable flag with the hour value silently
//    ignored. The hour is now honored as a DEADLINE: nothing fires before the
//    recipient-local clock reaches it. With the current single daily Vercel
//    run (01:00 UTC = 21:00 America/Campo_Grande) an hour later than the run
//    time can never fire — that config is unsatisfiable and is WARN-logged
//    instead of silently mis-firing early. If the schedule ever moves to
//    hourly (Vercel Pro), this same gate gives correct fire-at-hour behavior
//    plus catch-up for missed runs, with no further changes.
// 2. Sent-marker: the alert_events ledger row from a previous run of the same
//    (recipient, kind, care-day) — re-runs must not duplicate alerts
//    (email is the canonical must-not-double-fire cron side effect).

export interface DailyAlertGate {
  recipientId: string;
  timezone: string;
  deadlineHour: number;
  kind: AlertKind;
  /** Recipient-local YYYY-MM-DD the alert refers to */
  today: string;
}

export async function shouldDispatchDailyAlert(
  adminDb: SupabaseClient,
  gate: DailyAlertGate,
): Promise<boolean> {
  const hourNow = localHour(gate.timezone);
  if (hourNow < gate.deadlineHour) {
    logger.warn('cron: deadline hour not reached at run time — skipping', {
      action: 'deadline-gate',
      kind: gate.kind,
      deadlineHour: gate.deadlineHour,
      localHour: hourNow,
    });
    return false;
  }
  return !(await hasSentAlertToday(
    adminDb,
    gate.recipientId,
    gate.kind,
    gate.today,
  ));
}
