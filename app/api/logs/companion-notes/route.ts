import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeCareRequest } from '../../../../services/careTeam';
import {
  fetchCompanionNotes,
  type CompanionNoteWindow,
} from '../../../../services/companionNotes';
import { logger } from '../../../../services/logger';

// Read-only therapeutic-companion (caregiver) notes for the clinical team and
// admin (2026-07-30). Gated to the clinician role, so both specialists
// (psychologist + psychiatrist) see the same caregiver notes — profile does not
// scope this surface. The platform admin reaches it via the institution-wide
// view_as=clinician read. Default scope is the last 15 days (what the specialist
// needs at a glance); scope=all is the admin's exhaustive audit view. Caregiver
// notes are otherwise never returned by any read — the caregiver counterpart to
// the clinician-only /api/logs/notes lookup.

const RECENT_WINDOW_DAYS = 15;

function isoDayOffset(days: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// scope=all → unbounded (admin audit). Otherwise the last 15 days, capped at
// today: without the `until` ceiling, future-dated entries leaked into the
// clinician's "recent" view.
function windowFor(scope: string | null): CompanionNoteWindow {
  if (scope === 'all') return { since: null, until: null };
  return { since: isoDayOffset(-RECENT_WINDOW_DAYS), until: isoDayOffset(0) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['clinician']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  try {
    const notes = await fetchCompanionNotes(
      getAdminDbClient(),
      recipient.id,
      windowFor(req.nextUrl.searchParams.get('scope')),
    );
    return NextResponse.json({ notes });
  } catch (dbError) {
    logger.error(
      'companion-notes: query failed',
      { route: '/api/logs/companion-notes', action: 'select' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
