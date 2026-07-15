import { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeCareRequest } from '../../../../services/careTeam';
import {
  cadenceIssue,
  configIssueForType,
  METRIC_KEY_RE,
  MetricUpdateSchema,
} from '../../../../services/metricDefinitions';
import { weekdayMon0FromDateStr } from '../../../../services/dynamicLog';
import { logger } from '../../../../services/logger';

// Owner edits to one metric definition (M4, design §5.4). Label, order,
// active, required, cadence and config stay editable; value_type freezes the
// moment any log entry references the key (decision #4) — historical values
// are interpreted through the current definition, so retiring the key and
// creating a new one (e.g. sleep_v2) is the only sanctioned "type change".
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const { key } = await context.params;
  if (!METRIC_KEY_RE.test(key)) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = MetricUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const adminDb = getAdminDbClient();

  const { data: current, error: currentError } = await adminDb
    .from('metric_definitions')
    .select(
      'key, value_type, config, cadence, cadence_day, cadence_days, cadence_start, filled_by, clinician_profile',
    )
    .eq('recipient_id', recipient.id)
    .eq('key', key)
    .maybeSingle();
  if (currentError) {
    logger.error(
      'metrics: definition read failed',
      { route: '/api/metrics/[key]', action: 'read' },
      currentError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  if (!current) {
    return NextResponse.json(
      { error: 'Métrica não encontrada' },
      {
        status: 404,
      },
    );
  }

  // Decision #4: the type freezes once any entry carries the key. The values
  // object stores every active metric's key per entry (nulls included), so
  // key presence — not non-null data — is the reference test.
  if (patch.value_type && patch.value_type !== current.value_type) {
    const { data: referencing, error: refError } = await adminDb
      .from('care_log_entries')
      .select('id')
      .eq('recipient_id', recipient.id)
      .not(`values->${key}`, 'is', null)
      .limit(1);
    if (refError) {
      logger.error(
        'metrics: reference check failed',
        { route: '/api/metrics/[key]', action: 'reference-check' },
        refError,
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
    if ((referencing ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            'value_type é imutável após registros referenciarem a métrica — retire esta e crie uma nova chave',
        },
        { status: 409 },
      );
    }
  }

  const nextValueType = patch.value_type ?? current.value_type;
  const nextConfig = patch.config ?? current.config ?? {};
  const issue = configIssueForType(nextValueType, nextConfig);
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  // A specialist scope only makes sense on clinician-filled metrics (the DB
  // check backstops this against direct writes).
  const nextFilledBy = patch.filled_by ?? current.filled_by;
  const nextClinicianProfile =
    patch.clinician_profile !== undefined
      ? patch.clinician_profile
      : current.clinician_profile;
  if (nextClinicianProfile != null && nextFilledBy !== 'clinician') {
    return NextResponse.json(
      { error: 'clinician_profile requires filled_by=clinician' },
      { status: 400 },
    );
  }

  const nextCadence = patch.cadence ?? current.cadence;
  const nextCadenceDay =
    patch.cadence_day !== undefined ? patch.cadence_day : current.cadence_day;
  const nextCadenceDays: number[] | null | undefined =
    patch.cadence_days !== undefined
      ? patch.cadence_days
      : (current.cadence_days as number[] | null);
  const nextCadenceStart =
    patch.cadence_start !== undefined
      ? patch.cadence_start
      : current.cadence_start;
  const nextCadenceIssue = cadenceIssue({
    cadence: nextCadence,
    cadence_day: nextCadenceDay,
    cadence_days: nextCadenceDays,
    cadence_start: nextCadenceStart,
  });
  if (nextCadenceIssue) {
    return NextResponse.json({ error: nextCadenceIssue }, { status: 400 });
  }

  const cadenceTouched =
    patch.cadence !== undefined ||
    patch.cadence_day !== undefined ||
    patch.cadence_days !== undefined ||
    patch.cadence_start !== undefined;

  const weeklyDays =
    nextCadence === 'weekly' && nextCadenceDays?.length
      ? [...new Set(nextCadenceDays)].sort((a, b) => a - b)
      : null;

  const { error: updateError } = await adminDb
    .from('metric_definitions')
    .update({
      ...patch,
      ...(cadenceTouched
        ? {
            cadence: nextCadence,
            cadence_day:
              nextCadence === 'weekly' && !weeklyDays
                ? (nextCadenceDay ??
                  (nextCadenceStart
                    ? weekdayMon0FromDateStr(nextCadenceStart)
                    : null))
                : null,
            cadence_days: weeklyDays,
            cadence_start: nextCadence === 'daily' ? null : nextCadenceStart,
          }
        : {}),
    })
    .eq('recipient_id', recipient.id)
    .eq('key', key);

  if (updateError) {
    logger.error(
      'metrics: definition update failed',
      { route: '/api/metrics/[key]', action: 'update' },
      updateError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  logger.info('metrics: definition updated', {
    route: '/api/metrics/[key]',
    action: 'updated',
  });

  return NextResponse.json({ updated: true, key });
}
