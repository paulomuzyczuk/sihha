import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES, ROLES } from '../../../../../lib/constants';
import { getAdminDbClient } from '../../../../../services/db';
import { authorizeRequest } from '../../../../../services/apiAuth';
import { recountConsumableItem } from '../../../../../services/consumableItems';
import { logger } from '../../../../../services/logger';

const RecountSchema = z.object({
  current_quantity: z.number().min(0),
});

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

  const parsed = RecountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
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
