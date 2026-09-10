import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import { isRecipientInInstitution } from '../../../../services/institutionMembers';
import {
  createAlertRule,
  listAlertRules,
} from '../../../../services/alertRules';
import { logger } from '../../../../services/logger';

// Admin console: per-metric alert rules ("notify these people when this
// metric crosses this threshold"), scoped to one circle at a time.

const CreateSchema = z.object({
  recipient_id: z.string().uuid(),
  metric_key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/),
  comparator: z.enum(['gte', 'lte', 'eq']),
  threshold: z.number(),
  label: z.string().min(1).max(200),
  custom_subject: z.string().min(1).max(200).optional(),
  custom_body: z.string().min(1).max(2000).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const recipientId = req.nextUrl.searchParams.get('recipient_id');
  if (!recipientId || !z.string().uuid().safeParse(recipientId).success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  if (
    !(await isRecipientInInstitution(adminDb, recipientId, auth.institutionId))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions' },
      { status: 403 },
    );
  }

  const rules = await listAlertRules(adminDb, recipientId);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
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
  const { recipient_id, ...input } = parsed.data;

  const adminDb = getAdminDbClient();
  if (
    !(await isRecipientInInstitution(adminDb, recipient_id, auth.institutionId))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions' },
      { status: 403 },
    );
  }

  const { error } = await createAlertRule(adminDb, recipient_id, input);
  if (error) {
    logger.error(
      'alert-rules: create failed',
      { route: '/api/admin/alert-rules', action: 'create' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  logger.info('alert-rules: created', {
    route: '/api/admin/alert-rules',
    action: 'created',
  });
  return NextResponse.json({ created: true }, { status: 201 });
}
