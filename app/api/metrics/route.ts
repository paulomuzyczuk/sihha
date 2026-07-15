import { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import {
  isDueToday,
  localDate,
  localWeekdayMon0,
  weekdayMon0FromDateStr,
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
      'key, label, value_type, config, cadence, cadence_day, cadence_days, cadence_start, section, subsection, section_note, filled_by, clinician_profile, required, sort_order, active',
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
  const todayLocalDate = localDate(recipient.timezone);
  const metrics = ((data ?? []) as MetricDefinitionRow[]).map((def) => ({
    ...def,
    dueToday: isDueToday(def, weekday, todayLocalDate),
  }));

  // Whether the caller's role already logged today — the form shows that a
  // new submission overwrites the day's earlier answer. Clinician entries
  // are additionally scoped per specialist profile, mirroring /api/logs.
  let todayQuery = adminDb
    .from('care_log_entries')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipient.id)
    .eq('log_date', todayLocalDate)
    .eq('author_role', membership.role);
  if (membership.role === 'clinician') {
    todayQuery = membership.clinical_profile
      ? todayQuery.eq('author_profile', membership.clinical_profile)
      : todayQuery.is('author_profile', null);
  }
  const { count: todayCount } = await todayQuery;

  // The clinician feedback flow can re-open a past appointment: the last 10
  // attended appointments matching the caller's specialty (any specialty for
  // a profile-less clinician), read from the caregiver's daily entries.
  let appointmentDates: string[] = [];
  // Which of those selectable dates the clinical team already answered — the
  // form warns that resubmitting one overwrites the day's earlier record.
  let recordedDates: string[] = [];
  if (membership.role === 'clinician') {
    let apptQuery = adminDb
      .from('care_log_entries')
      .select('log_date')
      .eq('recipient_id', recipient.id)
      .eq('author_role', 'caregiver')
      .lte('log_date', todayLocalDate)
      .eq('values->>appointment_attended', 'true')
      .order('log_date', { ascending: false })
      .limit(10);
    apptQuery = membership.clinical_profile
      ? apptQuery.eq('values->>appointment_type', membership.clinical_profile)
      : apptQuery.neq('values->>appointment_type', 'none');
    const { data: apptRows, error: apptError } = await apptQuery;
    if (apptError) {
      logger.error(
        'metrics: appointment dates query failed',
        { route: '/api/metrics', action: 'appointments' },
        apptError,
      );
    }
    appointmentDates = ((apptRows ?? []) as { log_date: string }[]).map(
      (row) => row.log_date,
    );

    let recordedQuery = adminDb
      .from('care_log_entries')
      .select('log_date')
      .eq('recipient_id', recipient.id)
      .eq('author_role', 'clinician')
      .in('log_date', [...new Set([todayLocalDate, ...appointmentDates])]);
    recordedQuery = membership.clinical_profile
      ? recordedQuery.eq('author_profile', membership.clinical_profile)
      : recordedQuery.is('author_profile', null);
    const { data: recordedRows, error: recordedError } = await recordedQuery;
    if (recordedError) {
      logger.error(
        'metrics: recorded dates query failed',
        { route: '/api/metrics', action: 'recorded-dates' },
        recordedError,
      );
    }
    recordedDates = ((recordedRows ?? []) as { log_date: string }[]).map(
      (row) => row.log_date,
    );
  }

  // The med list rides along so the checklist renders one tri-state per
  // medication without a second, separately-authorized fetch.
  const { data: medRows } = await adminDb
    .from('medication_stocks')
    .select('name, daily_dosage')
    .eq('recipient_id', recipient.id)
    .order('name');

  return NextResponse.json({
    recipient: {
      id: recipient.id,
      displayName: recipient.display_name,
      timezone: recipient.timezone,
      logCadence: recipient.log_cadence,
    },
    role: membership.role,
    // Effective profile (view_profile-substituted for admin previews) — the
    // form filters clinician metrics against this, mirroring /api/logs.
    clinicalProfile: membership.clinical_profile ?? null,
    todayLocalDate,
    todaySubmitted: (todayCount ?? 0) > 0,
    appointmentDates,
    recordedDates,
    medications: (
      (medRows ?? []) as { name: string; daily_dosage: number }[]
    ).map((row) => ({ name: row.name, dailyDosage: row.daily_dosage })),
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

  // A weekly day set (cadence_days) wins; otherwise the single cadence_day
  // is stored even when the client only sent a start date (custom
  // recurrence) so every reader keeps one weekday source.
  const cadenceDays =
    metric.cadence === 'weekly' && metric.cadence_days?.length
      ? [...new Set(metric.cadence_days)].sort((a, b) => a - b)
      : null;
  const cadenceDay =
    metric.cadence === 'weekly' && !cadenceDays
      ? (metric.cadence_day ??
        (metric.cadence_start
          ? weekdayMon0FromDateStr(metric.cadence_start)
          : null))
      : null;

  const { error: insertError } = await adminDb
    .from('metric_definitions')
    .insert({
      recipient_id: recipient.id,
      key: metric.key,
      label: metric.label,
      short_label: metric.short_label ?? null,
      value_type: metric.value_type,
      config: metric.config,
      cadence: metric.cadence,
      cadence_day: cadenceDay,
      cadence_days: cadenceDays,
      cadence_start:
        metric.cadence === 'daily' ? null : (metric.cadence_start ?? null),
      section: metric.section ?? null,
      subsection: metric.subsection ?? null,
      filled_by: metric.filled_by,
      clinician_profile: metric.clinician_profile ?? null,
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
