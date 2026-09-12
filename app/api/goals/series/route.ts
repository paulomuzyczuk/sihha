import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeCareRequest } from '../../../../services/careTeam';
import { localDate } from '../../../../services/dynamicLog';
import { monthEnd, GoalProgramRow } from '../../../../services/goals';
import { computeGoalSeries, last8Weeks } from '../../../../services/goalSeries';
import { loadGoalInputs } from '../../../../services/goalInputs';
import { logger } from '../../../../services/logger';

const MONTH_RE = /^\d{4}-\d{2}$/;

// Per-sub-goal time series for the detail-view perspective switcher (M6): the
// intra-month accumulated-prize (R$) line and the last-8-weeks % attainment,
// keyed by goalRuleUid. The 12-month view reuses the per-month history the
// client already fetches, so it is not recomputed here. Same auth + month
// clamping as /api/goals; only the loaded window is wider (8 weeks back).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, [
    'owner',
    'caregiver',
    'clinician',
    'recipient',
  ]);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const adminDb = getAdminDbClient();
  const { data: programRow, error: programError } = await adminDb
    .from('goal_programs')
    .select('id, starts_on, monthly_award_cents, currency, categories, active')
    .eq('recipient_id', recipient.id)
    .eq('active', true)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (programError) {
    logger.error(
      'goals/series: program query failed',
      { route: '/api/goals/series', action: 'program' },
      programError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  if (!programRow) return NextResponse.json({ month: null, series: [] });
  const program = programRow as GoalProgramRow;

  const todayLocalDate = localDate(recipient.timezone);
  const firstMonth = program.starts_on.slice(0, 7);
  const currentMonth = todayLocalDate.slice(0, 7);
  const lastMonth = currentMonth > firstMonth ? currentMonth : firstMonth;

  const requested = req.nextUrl.searchParams.get('month');
  let month = requested && MONTH_RE.test(requested) ? requested : lastMonth;
  if (month < firstMonth) month = firstMonth;
  if (month > lastMonth) month = lastMonth;

  const periodStart =
    program.starts_on > `${month}-01` ? program.starts_on : `${month}-01`;
  const monthLastDay = monthEnd(month);
  // The window must cover both the intra-month days and the 8 trailing weeks.
  const weeks = last8Weeks(todayLocalDate);
  const loadStart = weeks[0].start < periodStart ? weeks[0].start : periodStart;
  const loadEnd = monthLastDay > todayLocalDate ? monthLastDay : todayLocalDate;

  const { inputs, error } = await loadGoalInputs(
    adminDb,
    recipient.id,
    loadStart,
    loadEnd,
  );
  if (error || !inputs) {
    logger.error(
      'goals/series: inputs query failed',
      { route: '/api/goals/series', action: 'inputs' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const series = computeGoalSeries(
    program,
    inputs.definitions,
    inputs.entries,
    month,
    todayLocalDate,
  );
  return NextResponse.json({ month, series });
}
