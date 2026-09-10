import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../../lib/constants';
import { getAdminDbClient } from '../../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../../services/institutionAuth';
import { isRecipientInInstitution } from '../../../../../services/institutionMembers';
import { recountConsumableItem } from '../../../../../services/consumableItems';
import { logger } from '../../../../../services/logger';

const RecountSchema = z.object({
  current_quantity: z.number().min(0),
});

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

  const parsed = RecountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  const { data: existingItem } = await adminDb
    .from('consumable_items')
    .select('recipient_id')
    .eq('id', id)
    .maybeSingle();
  if (
    !existingItem ||
    !(await isRecipientInInstitution(
      adminDb,
      existingItem.recipient_id,
      auth.institutionId,
    ))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions' },
      { status: 403 },
    );
  }

  const { data: item, error } = await recountConsumableItem(
    adminDb,
    id,
    parsed.data.current_quantity,
  );

  if (error) {
    logger.error(
      'consumables: recount failed',
      { route: '/api/admin/consumables/[id]', action: 'recount' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  if (!item) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 404 },
    );
  }

  return NextResponse.json({ item });
}
