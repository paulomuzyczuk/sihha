import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES, ROLES } from '../../../../../lib/constants';
import { getAdminDbClient } from '../../../../../services/db';
import { authorizeRequest } from '../../../../../services/apiAuth';
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
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
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
