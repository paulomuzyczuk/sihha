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
  weekdayMon0FromDateStr,
  MetricDefinitionRow,
} from '../../../services/dynamicLog';
import { computeLocationVerified } from '../../../services/geofence';
import { checkAndAlertLowStock } from '../../../services/stockAlert';
import { logger } from '../../../services/logger';

const envelopeSchema = z.object({
  values: z.record(z.unknown()),
  // Clinician-only backdating: the feedback flow can re-open a past
  // appointment; the entry lands on that date and overwrites as usual.
  logDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
  // 1. Authenticate and authorize via care-circle membership (M3/M6):
  //    every metric-filling role submits its own entry — the caregiver's
  //    daily log, the recipient's self-report scales, the clinical team's
  //    rated instruments — each scoped to the metrics it fills.
  const auth = await authorizeCareRequest(req, [
    'caregiver',
    'clinician',
    'recipient',
  ]);
  if (!auth.ok) return auth.response;
  const { user, userClient, membership, recipient } = auth;
  const authorRole = membership.role;
  // The specialist profile scopes clinician entries: the psychologist and
  // the psychiatrist each keep their own daily record (null for every other
  // role and for a profile-less clinician).
  const authorProfile =
    authorRole === 'clinician' ? (membership.clinical_profile ?? null) : null;

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
      'key, label, value_type, config, cadence, cadence_day, cadence_days, cadence_start, filled_by, clinician_profile, required, sort_order, active',
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

  // Each entry carries only the metrics its author's role fills — keys
  // belonging to another role are rejected as unknown. Clinician metrics may
  // additionally be scoped to one specialist (clinician_profile); null means
  // any clinician, and a profile-less clinician member only gets those.
  const roleDefinitions = ((defRows ?? []) as MetricDefinitionRow[]).filter(
    (def) =>
      def.filled_by === authorRole &&
      (def.filled_by !== 'clinician' ||
        def.clinician_profile == null ||
        def.clinician_profile === membership.clinical_profile),
  );

  const todayLocalDate = localDate(recipient.timezone);

  // A requested past date must be a real calendar day, never in the future,
  // and only the clinical team may backdate (their feedback flow re-opens a
  // past appointment; every other role logs the current day).
  const requestedDate = payload.logDate;
  if (requestedDate !== undefined) {
    const parsed = new Date(`${requestedDate}T00:00:00Z`);
    const roundTrips =
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === requestedDate;
    if (
      authorRole !== 'clinician' ||
      !roundTrips ||
      requestedDate > todayLocalDate
    ) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.VALIDATION_FAILED },
        { status: 400 },
      );
    }
  }
  const logDate = requestedDate ?? todayLocalDate;

  // Cadence/due-ness is judged on the entry's own date
  const weekday = requestedDate
    ? weekdayMon0FromDateStr(requestedDate)
    : localWeekdayMon0(recipient.timezone);
  const validated = validateValues(
    roleDefinitions,
    weekday,
    logDate,
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

  // 3. Cadence (per-recipient rule, API-enforced by design). One-per-day
  //    applies per author role, and a repeat submission for the same date
  //    OVERWRITES that role's earlier answer — the day keeps one entry.
  let existing: {
    id: string;
    values: Record<string, unknown>;
    notes: string | null;
    author_id: string;
    created_at: string;
  } | null = null;
  if (recipient.log_cadence === 'one_per_day') {
    let existingQuery = adminDb
      .from('care_log_entries')
      .select('id, values, notes, author_id, created_at')
      .eq('recipient_id', recipient.id)
      .eq('log_date', logDate)
      .eq('author_role', authorRole);
    existingQuery = authorProfile
      ? existingQuery.eq('author_profile', authorProfile)
      : existingQuery.is('author_profile', null);
    const { data: existingRow } = await existingQuery.maybeSingle();
    existing = existingRow ?? null;
  }
  const overwrite = existing !== null;

  // 4. Geofence verification from the recipient row (non-blocking)
  const locationVerified = computeLocationVerified(recipient, payload.location);

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  if (overwrite && existing) {
    // Audit first: the replaced answer is snapshotted so the owner can
    // always see what was changed, by whom and when. A failed snapshot
    // blocks the overwrite — no silent history loss.
    const { error: revisionError } = await adminDb
      .from('care_log_revisions')
      .insert({
        entry_id: existing.id,
        recipient_id: recipient.id,
        log_date: logDate,
        author_role: authorRole,
        author_profile: authorProfile,
        replaced_values: existing.values,
        replaced_notes: existing.notes,
        replaced_author_id: existing.author_id,
        replaced_created_at: existing.created_at,
        overwritten_by: user.id,
      });
    if (revisionError) {
      logger.error(
        'logs: revision snapshot failed',
        { route: '/api/logs', action: 'revision' },
        revisionError,
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }

    // Overwrites go through the admin client: the role check above already
    // authorized the write, and RLS keeps clients insert-only.
    let updateQuery = adminDb
      .from('care_log_entries')
      .update({
        author_id: user.id,
        created_at: createdAt,
        values: validated.values,
        notes: payload.notes ?? null,
        lat: payload.location?.lat ?? null,
        lng: payload.location?.lng ?? null,
        location_verified: locationVerified,
      })
      .eq('recipient_id', recipient.id)
      .eq('log_date', logDate)
      .eq('author_role', authorRole);
    updateQuery = authorProfile
      ? updateQuery.eq('author_profile', authorProfile)
      : updateQuery.is('author_profile', null);
    const { error: updateError } = await updateQuery;

    if (updateError) {
      logger.error(
        'logs: care_log_entries overwrite failed',
        { route: '/api/logs', action: 'overwrite' },
        updateError,
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }

    // The revision row above holds the replaced content; this line makes the
    // event itself greppable in the request logs.
    logger.info('logs: entry overwritten', {
      route: '/api/logs',
      action: 'overwrite',
      userId: user.id,
      entryId: existing.id,
      logDate,
      authorRole,
      authorProfile,
    });
  } else {
    // 5. Insert through the user-scoped client so RLS enforces the write
    //    (membership role + own author_id) as defense in depth behind the
    //    role check above. Write-only by policy — id/timestamp generated here.
    const { error: dbError } = await userClient
      .from('care_log_entries')
      .insert({
        id,
        created_at: createdAt,
        recipient_id: recipient.id,
        author_id: user.id,
        author_role: authorRole,
        author_profile: authorProfile,
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
  }

  // 6. Stock check (side effect, never blocks the response) — meds live in
  //    the caregiver's metrics, so other roles' entries never move stock
  try {
    if (authorRole === 'caregiver') {
      await checkAndAlertLowStock(adminDb, recipient.id);
    }
  } catch (stockError) {
    logger.error(
      'logs: low-stock check failed',
      { route: '/api/logs', action: 'stock-check' },
      stockError,
    );
  }

  return NextResponse.json({ id, createdAt, overwrote: overwrite });
}
