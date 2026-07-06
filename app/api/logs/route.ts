import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import {
  localDate,
  localWeekdayMon0,
  validateValues,
  MetricDefinitionRow,
} from '../../../services/dynamicLog';
import { computeLocationVerified } from '../../../services/geofence';
import { checkAndAlertLowStock } from '../../../services/stockAlert';
import { logger } from '../../../services/logger';

const envelopeSchema = z.object({
  values: z.record(z.unknown()),
  notes: z.string().max(1000).optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate and authorize via care-circle membership (M3): only
  //    caregivers submit logs, scoped to their circle.
  const auth = await authorizeCareRequest(req, ['caregiver']);
  if (!auth.ok) return auth.response;
  const { user, userClient, recipient } = auth;

  // 2. Envelope validation, then dynamic validation against the recipient's
  //    metric definitions (schema-as-data)
  let bodyJson;
  try {
    bodyJson = await req.json();
  } catch (_e) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const envelope = envelopeSchema.safeParse(bodyJson);
  if (!envelope.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const payload = envelope.data;

  const adminDb = getAdminDbClient();
  const { data: defRows, error: defError } = await adminDb
    .from('metric_definitions')
    .select(
      'key, label, value_type, config, cadence, cadence_day, filled_by, required, sort_order, active',
    )
    .eq('recipient_id', recipient.id)
    .eq('active', true);
  if (defError) {
    logger.error(
      'logs: metric_definitions query failed',
      { route: '/api/logs', action: 'definitions' },
      defError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const weekday = localWeekdayMon0(recipient.timezone);
  const validated = validateValues(
    (defRows ?? []) as MetricDefinitionRow[],
    weekday,
    payload.values,
  );
  if (!validated.ok) {
    logger.warn('logs: dynamic validation failed', {
      route: '/api/logs',
      action: 'validate',
      issues: validated.issues,
    });
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  // 3. Cadence enforcement (per-recipient rule, API-enforced by design)
  const logDate = localDate(recipient.timezone);
  if (recipient.log_cadence === 'one_per_day') {
    const { count } = await adminDb
      .from('care_log_entries')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', recipient.id)
      .eq('log_date', logDate);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Registro de hoje já existe' },
        { status: 409 },
      );
    }
  }

  // 4. Geofence verification from the recipient row (non-blocking)
  const locationVerified = computeLocationVerified(recipient, payload.location);

  // 5. Insert through the user-scoped client so RLS enforces the write
  //    (caregiver membership + own author_id) as defense in depth behind the
  //    role check above. Write-only by policy — id/timestamp generated here.
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const { error: dbError } = await userClient.from('care_log_entries').insert({
    id,
    created_at: createdAt,
    recipient_id: recipient.id,
    author_id: user.id,
    log_date: logDate,
    values: validated.values,
    notes: payload.notes,
    lat: payload.location?.lat ?? null,
    lng: payload.location?.lng ?? null,
    location_verified: locationVerified,
  });

  if (dbError) {
    logger.error(
      'logs: care_log_entries insert failed',
      { route: '/api/logs', action: 'insert' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  // 6. Stock check (side effect, never blocks the response)
  try {
    await checkAndAlertLowStock(adminDb, recipient.id);
  } catch (stockError) {
    logger.error(
      'logs: low-stock check failed',
      { route: '/api/logs', action: 'stock-check' },
      stockError,
    );
  }

  return NextResponse.json({ id, createdAt });
}
