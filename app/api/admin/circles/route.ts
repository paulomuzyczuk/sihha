import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import { logger } from '../../../../services/logger';

/**
 * Every active circle the caller's institution owns (id + display name),
 * for the admin console's circle selector. Institution-scoped — an admin
 * never sees another institution's circles, even ones they don't hold a
 * care_team_members membership in themselves.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb
    .from('care_recipients')
    .select('id, display_name')
    .eq('institution_id', auth.institutionId)
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
