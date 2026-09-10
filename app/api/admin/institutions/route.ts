import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import {
  authorizeInstitutionAdminRequest,
  listCallerAdminInstitutions,
} from '../../../../services/institutionAuth';
import { logger } from '../../../../services/logger';

/**
 * Institutions the caller administers (id + name). Powers the institution
 * switcher, which renders only when this returns more than one.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const result = await listCallerAdminInstitutions(req);
  if (!result.ok) return result.response;
  return NextResponse.json({ institutions: result.institutions });
}

const RenameSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/**
 * Rename the caller's own institution. Scoped by
 * authorizeInstitutionAdminRequest, so the rename can only land on the
 * caller's own institution — there is no id in the body to spoof.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const adminDb = getAdminDbClient();
  const { error } = await adminDb
    .from('institutions')
    .update({ name: parsed.data.name })
    .eq('id', auth.institutionId);

  if (error) {
    logger.error(
      'institutions: rename failed',
      { route: '/api/admin/institutions', action: 'rename' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ renamed: true });
}
