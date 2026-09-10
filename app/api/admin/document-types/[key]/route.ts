import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../../lib/constants';
import { getAdminDbClient } from '../../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../../services/institutionAuth';
import {
  DOCUMENT_TYPE_KEYS,
  updateDocumentType,
} from '../../../../../services/documentTypes';
import { logger } from '../../../../../services/logger';

const UpdateSchema = z.object({
  active: z.boolean().optional(),
  copy: z.record(z.unknown()).optional(),
});

/** Toggle active or edit the admin-facing copy override for one doc type. */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const { key: docKey } = await context.params;
  if (
    !DOCUMENT_TYPE_KEYS.includes(docKey as (typeof DOCUMENT_TYPE_KEYS)[number])
  ) {
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

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  const { error } = await updateDocumentType(
    adminDb,
    auth.institutionId,
    docKey as (typeof DOCUMENT_TYPE_KEYS)[number],
    parsed.data,
  );

  if (error) {
    logger.error(
      'document-types: update failed',
      { route: '/api/admin/document-types/[key]', action: 'update', docKey },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ updated: true });
}
