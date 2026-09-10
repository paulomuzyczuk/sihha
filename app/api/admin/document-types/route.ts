import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import { listDocumentTypes } from '../../../../services/documentTypes';
import { logger } from '../../../../services/logger';

/** The caller's institution's document-type config (admin console, documents tab). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const adminDb = getAdminDbClient();
  try {
    const documentTypes = await listDocumentTypes(adminDb, auth.institutionId);
    return NextResponse.json({ documentTypes });
  } catch (err) {
    logger.error(
      'document-types: list failed',
      { route: '/api/admin/document-types', action: 'list' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
