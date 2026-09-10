import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import { institutionMemberAccounts } from '../../../../services/institutionMembers';
import { logger } from '../../../../services/logger';

// Account picker for admin flows (e.g. assigning a circle owner at
// creation): identity only — id and e-mail — never tiers, memberships or
// metadata. Scoped to the caller's institution: resolved per-id via the
// auth admin API from institution_members, NEVER via a platform-wide
// listUsers() — that previously let any admin enumerate every account on
// the deployment, a cross-tenant PII leak the moment a second institution
// exists.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeInstitutionAdminRequest(req);
  if (!auth.ok) return auth.response;

  const adminDb = getAdminDbClient();
  try {
    const accounts = await institutionMemberAccounts(
      adminDb,
      auth.institutionId,
    );
    return NextResponse.json({
      users: accounts.sort((a, b) => a.email.localeCompare(b.email)),
    });
  } catch (err) {
    logger.error(
      'users: institutionMemberAccounts failed',
      { route: '/api/admin/users', action: 'list' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
