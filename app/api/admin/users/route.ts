import { NextRequest, NextResponse } from 'next/server';
import { ROLES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeRequest } from '../../../../services/apiAuth';
import { logger } from '../../../../services/logger';

// Account picker for admin flows (e.g. assigning a circle owner at creation):
// identity only — id and e-mail — never tiers, memberships or metadata.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
  if (!auth.ok) return auth.response;

  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    logger.error(
      'users: listUsers failed',
      { route: '/api/admin/users', action: 'list' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    users: data.users
      .filter((u) => u.email)
      .map((u) => ({ id: u.id, email: u.email as string }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  });
}
