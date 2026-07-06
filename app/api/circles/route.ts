import { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { getAdminDbClient } from '../../../services/db';
import { getAuthenticatedUser, getClientIp } from '../../../services/apiAuth';
import {
  checkIpRateLimit,
  checkUserRateLimit,
} from '../../../services/rateLimiter';
import { logger } from '../../../services/logger';

interface CircleMembershipRow {
  recipient_id: string;
  role: string;
  care_recipients: { display_name: string; kind: string };
}

// The circle-switcher contract (M4): every authenticated user may list the
// care circles they belong to — recipient identity only, never the recipient
// row's geofence coordinates (that is why this is a service-role read instead
// of a client RLS policy on care_recipients). Unlike authorizeCareRequest,
// no single membership is resolved: the whole point is enumerating them.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.RATE_LIMIT },
      { status: 429 },
    );
  }

  const authed = await getAuthenticatedUser(req);
  if (!authed) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 },
    );
  }
  const { user } = authed;

  if (!(await checkUserRateLimit(user.id)).allowed) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.RATE_LIMIT },
      { status: 429 },
    );
  }

  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb
    .from('care_team_members')
    .select('recipient_id, role, care_recipients!inner(display_name, kind)')
    .eq('user_id', user.id)
    .eq('care_recipients.active', true);

  if (error) {
    logger.error(
      'circles: membership query failed',
      { route: '/api/circles', action: 'select' },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const circles = ((data ?? []) as unknown as CircleMembershipRow[]).map(
    (row) => ({
      recipientId: row.recipient_id,
      role: row.role,
      displayName: row.care_recipients.display_name,
      kind: row.care_recipients.kind,
    }),
  );

  return NextResponse.json({ circles });
}
