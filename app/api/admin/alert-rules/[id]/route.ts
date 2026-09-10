import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../../lib/constants';
import { getAdminDbClient } from '../../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../../services/institutionAuth';
import { isRecipientInInstitution } from '../../../../../services/institutionMembers';
import { updateAlertRule } from '../../../../../services/alertRules';
import { logger } from '../../../../../services/logger';

const UpdateSchema = z
  .object({
    metric_key: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    comparator: z.enum(['gte', 'lte', 'eq']),
    threshold: z.number(),
    label: z.string().min(1).max(200),
    custom_subject: z.string().min(1).max(200).nullable(),
    custom_body: z.string().min(1).max(2000).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  const { data: existingRule } = await adminDb
    .from('metric_alert_rules')
    .select('recipient_id')
    .eq('id', id)
    .maybeSingle();
  if (
    !existingRule ||
    !(await isRecipientInInstitution(
      adminDb,
      existingRule.recipient_id,
      auth.institutionId,
    ))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions' },
      { status: 403 },
    );
  }

  const { error } = await updateAlertRule(adminDb, id, parsed.data);
  if (error) {
    logger.error(
      'alert-rules: update failed',
      { route: '/api/admin/alert-rules/[id]', action: 'update', ruleId: id },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ updated: true });
}
