import { NextRequest, NextResponse } from 'next/server';
import { ROLES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeRequest } from '../../../../services/apiAuth';
import { logger } from '../../../../services/logger';

/**
 * Every active circle on the deployment (id + display name), for the admin
 * console's circle selector. A self-hosted deployment has one platform ADMIN
 * tier and no tenant boundary, so this is a plain platform-wide list — the
 * same posture as GET /api/admin/users.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
  if (!auth.ok) return auth.response;

  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb
    .from('care_recipients')
    .select('id, display_name')
    .eq('active', true)
    .order('display_name');

  if (error) {
    logger.error(
      'circles: list failed',
      { route: '/api/admin/circles', action: 'list' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    circles: (data ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
    })),
  });
}
