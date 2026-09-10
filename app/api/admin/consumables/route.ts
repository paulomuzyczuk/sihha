import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import { isRecipientInInstitution } from '../../../../services/institutionMembers';
import {
  createConsumableItem,
  listConsumableItems,
} from '../../../../services/consumableItems';
import { logger } from '../../../../services/logger';

// Admin-managed consumable/medical-supply counting (services/consumableItems.ts):
// list and create, scoped to one care circle at a time via ?recipient_id=.
// Recounting an existing item is a separate PATCH on its own id (see [id]/route.ts).

const CreateSchema = z.object({
  recipient_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  current_quantity: z.number().min(0),
  daily_usage_rate: z.number().positive(),
  low_stock_threshold_days: z.number().positive().optional(),
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

  const items = await listConsumableItems(adminDb, recipientId);
  return NextResponse.json({ items });
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

  const { data: item, error } = await createConsumableItem(
    adminDb,
    recipient_id,
    input,
  );

  if (error || !item) {
    logger.error(
      'consumables: create failed',
      { route: '/api/admin/consumables', action: 'create' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ item }, { status: 201 });
}
