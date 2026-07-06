import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { ERROR_MESSAGES } from '../lib/constants';
import { getAdminDbClient } from './db';
import { getAuthenticatedUser, getClientIp } from './apiAuth';
import { checkIpRateLimit, checkUserRateLimit } from './rateLimiter';

// M3 authorization: what a user may do is decided by their membership in a
// care circle (care_team_members.role), not by a global JWT tier. The JWT
// app_metadata keeps only the platform ADMIN flag (see authorizeRequest,
// still used by /api/admin/*). This is the single authoritative preamble for
// membership-scoped routes.

export type CareRole = 'owner' | 'caregiver' | 'clinician' | 'recipient';

export interface CareRecipientRow {
  id: string;
  display_name: string;
  kind: string;
  timezone: string;
  log_cadence: 'one_per_day' | 'multiple_per_day';
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
  active: boolean;
}

export interface CareMembership {
  recipient_id: string;
  role: CareRole;
  receives_alerts: boolean;
  care_recipients: CareRecipientRow;
}

export type CareAuthResult =
  | {
      ok: true;
      user: User;
      userClient: SupabaseClient;
      membership: CareMembership;
      recipient: CareRecipientRow;
    }
  | { ok: false; response: NextResponse };

/**
 * Full authenticate-and-authorize preamble for membership-scoped routes:
 * IP rate limit → JWT verification → membership + recipient lookup → care
 * role check → per-user rate limit.
 *
 * Recipient resolution: a `recipient` query param when present (validated
 * against the caller's memberships), otherwise the user's single membership.
 * Users with several memberships must pass the param — the flagship
 * deployment has one circle, so the param stays optional there.
 */
export async function authorizeCareRequest(
  req: NextRequest,
  allowedRoles: readonly CareRole[],
): Promise<CareAuthResult> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ERROR_MESSAGES.RATE_LIMIT },
        { status: 429 },
      ),
    };
  }

  const authed = await getAuthenticatedUser(req);
  if (!authed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ERROR_MESSAGES.UNAUTHORIZED },
        { status: 401 },
      ),
    };
  }
  const { user, userClient } = authed;

  const adminDb = getAdminDbClient();
  const { data: memberships, error } = await adminDb
    .from('care_team_members')
    .select(
      'recipient_id, role, receives_alerts, care_recipients!inner(id, display_name, kind, timezone, log_cadence, geo_lat, geo_lng, geo_radius_m, active)',
    )
    .eq('user_id', user.id)
    .eq('care_recipients.active', true);

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      ),
    };
  }

  const rows = (memberships ?? []) as unknown as CareMembership[];
  const requestedRecipient = req.nextUrl.searchParams.get('recipient');
  const membership = requestedRecipient
    ? rows.find((m) => m.recipient_id === requestedRecipient)
    : rows.length === 1
      ? rows[0]
      : undefined;

  if (!membership || !allowedRoles.includes(membership.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 },
      ),
    };
  }

  if (!(await checkUserRateLimit(user.id)).allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ERROR_MESSAGES.RATE_LIMIT },
        { status: 429 },
      ),
    };
  }

  return {
    ok: true,
    user,
    userClient,
    membership,
    recipient: membership.care_recipients,
  };
}

/** Members of a circle flagged to receive alerts, with their auth e-mails. */
export async function getAlertRecipientEmails(
  adminDb: SupabaseClient,
  recipientId: string,
): Promise<string[]> {
  const { data: members } = await adminDb
    .from('care_team_members')
    .select('user_id')
    .eq('recipient_id', recipientId)
    .eq('receives_alerts', true);

  const emails: string[] = [];
  for (const member of members ?? []) {
    const { data } = await adminDb.auth.admin.getUserById(member.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  // Platform fallback: the instance operator always hears about problems,
  // even when no membership is flagged (or flagged e-mails are stale).
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && !emails.includes(adminEmail)) emails.push(adminEmail);
  return emails;
}
