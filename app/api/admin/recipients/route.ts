import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES, ROLES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeRequest } from '../../../../services/apiAuth';
import { logger } from '../../../../services/logger';
import {
  CARE_TEMPLATES,
  getTemplate,
  templateMetricRows,
} from '../../../../templates';

// Create-recipient-from-template (M4, design §3.5/§5.4): platform ADMIN
// instantiates a care circle from a care profile — recipient row + metric
// definitions + alert config. Every circle is created with an explicitly
// assigned owner member (owner_user_id, picked by the admin — e.g. a family
// member owns the pet's circle), so no circle exists without an owner.
// Everything after creation (team, metrics, alerts) is owner-editable; the
// template is a starting point, not a live link.

const CreateSchema = z.object({
  template_id: z.string().min(1),
  display_name: z.string().min(1).max(200),
  owner_user_id: z.string().uuid(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'invalid IANA timezone' },
    ),
  log_cadence: z.enum(['one_per_day', 'multiple_per_day']).optional(),
});

/** Templates the admin can instantiate (identity only, for the picker). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    templates: CARE_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      kind: template.kind,
      logCadence: template.log_cadence,
      metricCount: template.metrics.length,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const { template_id, display_name, timezone, owner_user_id } = parsed.data;

  const template = getTemplate(template_id);
  if (!template) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();

  // The assigned owner must be an existing account — a circle must never be
  // created ownerless or pointing at a dangling user id.
  const ownerLookup = await adminDb.auth.admin.getUserById(owner_user_id);
  if (ownerLookup.error || !ownerLookup.data?.user) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const { data: recipient, error: recipientError } = await adminDb
    .from('care_recipients')
    .insert({
      display_name,
      kind: template.kind,
      timezone,
      log_cadence: parsed.data.log_cadence ?? template.log_cadence,
      // Geofencing is off by default (decision #3) — per-recipient opt-in
    })
    .select('id, display_name')
    .single();

  if (recipientError || !recipient) {
    logger.error(
      'recipients: care_recipients insert failed',
      { route: '/api/admin/recipients', action: 'recipient', template_id },
      recipientError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const { error: metricsError } = await adminDb
    .from('metric_definitions')
    .insert(templateMetricRows(template, recipient.id));

  const { error: alertError } = metricsError
    ? { error: null }
    : await adminDb.from('alert_configs').insert({
        recipient_id: recipient.id,
        missing_log_hour: template.alert_config.missing_log_hour,
        low_stock_days: template.alert_config.low_stock_days,
      });

  const { error: membershipError } =
    metricsError || alertError
      ? { error: null }
      : await adminDb.from('care_team_members').insert({
          recipient_id: recipient.id,
          user_id: owner_user_id,
          role: 'owner',
          member_label: null,
          receives_alerts: false,
        });

  const failed = metricsError ?? alertError ?? membershipError;
  if (failed) {
    // Rollback: deleting the recipient cascades to metric definitions,
    // alert config and memberships, so the admin can simply retry.
    logger.error(
      'recipients: instantiation failed, rolling back',
      { route: '/api/admin/recipients', action: 'instantiate', template_id },
      failed,
    );
    await adminDb.from('care_recipients').delete().eq('id', recipient.id);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  logger.info('recipients: circle created from template', {
    route: '/api/admin/recipients',
    action: 'created',
    template_id,
  });

  return NextResponse.json(
    {
      recipient: { id: recipient.id, displayName: recipient.display_name },
      metricCount: template.metrics.length,
    },
    { status: 201 },
  );
}
