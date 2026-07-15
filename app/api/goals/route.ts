import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import { localDate, MetricDefinitionRow } from '../../../services/dynamicLog';
import {
  computeGoalProgress,
  computeGoalRunRate,
  groceryBreakdown,
  groceryShareDefinition,
  groceryShareEntries,
  monthEnd,
  GoalProgramRow,
  InvoiceItemLite,
  LogEntryLite,
} from '../../../services/goals';
import { logger } from '../../../services/logger';

const MONTH_RE = /^\d{4}-\d{2}$/;

// The goal-program contract (M6): every circle member may read the
// recipient's goal progress — the patient sees what the award stands at,
// the team sees what still needs attention. ?month=YYYY-MM browses other
// months, clamped between the program's first month and the current one
// (or the first month itself while the program hasn't started). Score math
// lives in services/goals.ts; this route only assembles its inputs.
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
      'goals: program query failed',
      { route: '/api/goals', action: 'program' },
      programError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  if (!programRow) {
    return NextResponse.json({ program: null, progress: null });
  }
  const program = programRow as GoalProgramRow;

  const todayLocalDate = localDate(recipient.timezone);
  const programMeta = {
    startsOn: program.starts_on,
    monthlyAwardCents: program.monthly_award_cents,
    currency: program.currency,
    started: program.starts_on <= todayLocalDate,
  };

  // Browsable months: from the program's first month up to the current one
  // (the first month itself while the program hasn't started yet)
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

  const [defsRes, entriesRes, itemsRes] = await Promise.all([
    adminDb
      .from('metric_definitions')
      .select(
        'key, label, short_label, value_type, config, cadence, cadence_day, cadence_days, cadence_start, filled_by, required, sort_order, active',
      )
      .eq('recipient_id', recipient.id)
      .eq('active', true),
    adminDb
      .from('care_log_entries')
      .select('log_date, values')
      .eq('recipient_id', recipient.id)
      .gte('log_date', periodStart)
      .lte('log_date', monthLastDay),
    // Supermercado: classified grocery line items become synthetic
    // entries under the virtual GROCERY_SHARE_KEY metric
    adminDb
      .from('invoice_items')
      .select(
        'purchase_date, amount_cents, discretionary, category, invoices!inner(doc_type)',
      )
      .eq('recipient_id', recipient.id)
      .eq('invoices.doc_type', 'grocery')
      .gte('purchase_date', periodStart)
      .lte('purchase_date', monthLastDay),
  ]);

  if (defsRes.error || entriesRes.error || itemsRes.error) {
    logger.error(
      'goals: inputs query failed',
      { route: '/api/goals', action: 'inputs' },
      defsRes.error ?? entriesRes.error ?? itemsRes.error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const items = (itemsRes.data ?? []) as unknown as InvoiceItemLite[];
  const definitions = [
    ...((defsRes.data ?? []) as MetricDefinitionRow[]),
    groceryShareDefinition(),
  ];
  const entries = [
    ...((entriesRes.data ?? []) as LogEntryLite[]),
    ...groceryShareEntries(items),
  ];

  const progress = computeGoalProgress(program, definitions, entries, month);
  const runRate = computeGoalRunRate(program, definitions, entries, month);

  return NextResponse.json({
    program: programMeta,
    months: { first: firstMonth, last: lastMonth },
    progress,
    runRate,
    grocery: groceryBreakdown(items),
  });
}
