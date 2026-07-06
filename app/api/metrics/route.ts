import { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import {
  isDueToday,
  localDate,
  localWeekdayMon0,
  MetricDefinitionRow,
} from '../../../services/dynamicLog';
import {
  configIssueForType,
  MetricCreateSchema,
} from '../../../services/metricDefinitions';
import { logger } from '../../../services/logger';

// The form-rendering contract: every circle member may read the recipient's
// metric definitions; the client renders the set matching its role
// (filled_by) and today's cadence (dueToday, computed recipient-local here
// so clients never do timezone math). Owners may additionally request
// retired definitions (include_inactive=1) for the metric editor.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, [
    'owner',
    'caregiver',
    'clinician',
    'recipient',
  ]);
  if (!auth.ok) return auth.response;
  const { recipient, membership } = auth;

  const includeInactive =
    membership.role === 'owner' &&
    req.nextUrl.searchParams.get('include_inactive') === '1';

  const adminDb = getAdminDbClient();
  let query = adminDb
    .from('metric_definitions')
    .select(
      'key, label, value_type, config, cadence, cadence_day, filled_by, required, sort_order, active',
    )
    .eq('recipient_id', recipient.id);
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order', {
    ascending: true,
  });

  if (error) {
    logger.error(
      'metrics: metric_definitions query failed',
      { route: '/api/metrics', action: 'select' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const weekday = localWeekdayMon0(recipient.timezone);
  const metrics = ((data ?? []) as MetricDefinitionRow[]).map((def) => ({
    ...def,
    dueToday: isDueToday(def, weekday),
  }));

  return NextResponse.json({
    recipient: {
      id: recipient.id,
      displayName: recipient.display_name,
      timezone: recipient.timezone,
      logCadence: recipient.log_cadence,
    },
    role: membership.role,
    todayLocalDate: localDate(recipient.timezone),
    metrics,
  });
}

// Owner-created metric definition (M4, design §5.4). The new metric lands at
// the end of the form (max sort_order + 1); duplicates of an existing key —
// including a retired one, whose history the key still owns — are a 409.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = MetricCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const metric = parsed.data;

  const issue = configIssueForType(metric.value_type, metric.config);
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const adminDb = getAdminDbClient();

  const { data: existing, error: existingError } = await adminDb
    .from('metric_definitions')
    .select('key, sort_order')
    .eq('recipient_id', recipient.id);
  if (existingError) {
    logger.error(
      'metrics: definitions read failed',
      { route: '/api/metrics', action: 'create-read' },
      existingError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  const rows = existing ?? [];

  if (rows.some((row) => row.key === metric.key)) {
    return NextResponse.json(
      { error: 'Já existe uma métrica com essa chave' },
      { status: 409 },
    );
  }
  if (
    metric.config.depends_on &&
    !rows.some((row) => row.key === metric.config.depends_on)
  ) {
    return NextResponse.json(
      { error: 'depends_on must reference an existing metric key' },
      { status: 400 },
    );
  }

  const nextSortOrder =
    rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;

  const { error: insertError } = await adminDb
    .from('metric_definitions')
    .insert({
      recipient_id: recipient.id,
      key: metric.key,
      label: metric.label,
      value_type: metric.value_type,
      config: metric.config,
      cadence: metric.cadence,
      cadence_day: metric.cadence === 'weekly' ? metric.cadence_day : null,
      filled_by: metric.filled_by,
      required: metric.required,
      sort_order: nextSortOrder,
    });

  if (insertError) {
    logger.error(
      'metrics: definition insert failed',
      { route: '/api/metrics', action: 'create' },
      insertError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  logger.info('metrics: definition created', {
    route: '/api/metrics',
    action: 'created',
  });

  return NextResponse.json(
    { created: true, key: metric.key, sort_order: nextSortOrder },
    { status: 201 },
  );
}
