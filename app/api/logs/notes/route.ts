import { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeCareRequest } from '../../../../services/careTeam';
import { logger } from '../../../../services/logger';

// Session-note lookup for the clinical team (2026-07-24). The clinician records
// a qualitative session write-up as a per-profile text METRIC in the entry's
// `values` (psychologist → session_feedback_text; psychiatrist →
// appointment_feedback_text) — the clinician form has no top-level notes page
// (withNotes=false since M8). This returns that write-up for a single date so a
// specialist can review a past session without cluttering the entry flow.
// Scoped to the caller's OWN profile (author_profile = their clinical_profile)
// so the psychologist sees the psychology record and the psychiatrist the
// appointment record — never each other's. This is a deliberate, membership +
// profile-scoped surface.
//
// 2026-08-08: repointed from the legacy top-level `notes` column (which the
// clinician form never populated — only a since-cleared seed did) to the
// `values` feedback metric where write-ups have actually lived since M8.

// The `values` key that holds the session write-up, per clinical profile.
const FEEDBACK_KEY_BY_PROFILE: Record<string, string> = {
  psychologist: 'session_feedback_text',
  psychiatrist: 'appointment_feedback_text',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The regex admits impossible dates (2026-13-40); the Date round-trip rejects
// those the same way the labs and logs routes validate a supplied date.
function isRealCalendarDate(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === dateStr
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['clinician']);
  if (!auth.ok) return auth.response;
  const { recipient, membership } = auth;

  const date = req.nextUrl.searchParams.get('date');
  if (!date || !isRealCalendarDate(date)) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  let query = adminDb
    .from('care_log_entries')
    .select('values')
    .eq('recipient_id', recipient.id)
    .eq('log_date', date)
    .eq('author_role', 'clinician');
  // Isolate by specialist: a psychologist never reads a psychiatrist's note.
  query = membership.clinical_profile
    ? query.eq('author_profile', membership.clinical_profile)
    : query.is('author_profile', null);
  const { data, error: dbError } = await query.maybeSingle();

  if (dbError) {
    logger.error(
      'logs-notes: query failed',
      { route: '/api/logs/notes', action: 'select' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const feedbackKey = membership.clinical_profile
    ? FEEDBACK_KEY_BY_PROFILE[membership.clinical_profile]
    : undefined;
  const values = (data?.values ?? {}) as Record<string, unknown>;
  const note =
    feedbackKey && typeof values[feedbackKey] === 'string'
      ? (values[feedbackKey] as string)
      : null;
  return NextResponse.json({ date, notes: note });
}
