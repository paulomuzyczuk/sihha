import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { ERROR_MESSAGES, ROLES } from '../lib/constants';
import { getAdminDbClient } from './db';
import { getAuthenticatedUser, getClientIp } from './apiAuth';
import { checkIpRateLimit, checkUserRateLimit } from './rateLimiter';

// M3 authorization: what a user may do is decided by their membership in a
// care circle (care_team_members.role), not by a global JWT tier. The JWT
// app_metadata keeps only the platform ADMIN flag (see authorizeRequest,
// still used by /api/admin/*). This is the single authoritative preamble for
// membership-scoped routes.

export type CareRole = 'owner' | 'caregiver' | 'clinician' | 'recipient';

const CARE_ROLE_VALUES: readonly CareRole[] = [
  'owner',
  'caregiver',
  'clinician',
  'recipient',
];

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

// Clinical profiles a clinician member can carry (care_team_members
// .clinical_profile). Distinct from the care role: profile describes the
// specialist, role governs access. 'therapist' also exists in the column but
// therapists join circles as caregivers, so only these two scope inputs.
export type ClinicianProfile = 'psychologist' | 'psychiatrist';

const CLINICIAN_PROFILE_VALUES: readonly ClinicianProfile[] = [
  'psychologist',
  'psychiatrist',
];

export interface CareMembership {
  recipient_id: string;
  role: CareRole;
  clinical_profile: string | null;
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
 * Recipient resolution: `opts.recipientId` when given (FHIR routes identify
 * the circle via the `patient` search param or the resource path), otherwise
 * a `recipient` query param when present (validated against the caller's
 * memberships), otherwise the user's single membership. Users with several
 * memberships must identify the circle — the flagship deployment has one, so
 * the param stays optional there.
 *
 * Role preview: a `view_as` query param lets the PLATFORM ADMIN exercise the
 * app as another circle role (the dashboard's role-view switcher). Membership
 * in the circle is still required — view_as only replaces the stored role for
 * this request. Everyone else is locked to their stored role: a non-admin
 * sending view_as is rejected outright rather than silently ignored.
 */
export async function authorizeCareRequest(
  req: NextRequest,
  allowedRoles: readonly CareRole[],
  opts: { recipientId?: string } = {},
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
      'recipient_id, role, clinical_profile, receives_alerts, care_recipients!inner(id, display_name, kind, timezone, log_cadence, geo_lat, geo_lng, geo_radius_m, active)',
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
  const requestedRecipient =
    opts.recipientId ?? req.nextUrl.searchParams.get('recipient');
  let membership = requestedRecipient
    ? rows.find((m) => m.recipient_id === requestedRecipient)
    : rows.length === 1
      ? rows[0]
      : undefined;

  const viewAs = req.nextUrl.searchParams.get('view_as');
  if (viewAs !== null) {
    const isPlatformAdmin = user.app_metadata?.role === ROLES.ADMIN;
    if (!isPlatformAdmin || !CARE_ROLE_VALUES.includes(viewAs as CareRole)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 },
        ),
      };
    }
    if (membership) {
      membership = { ...membership, role: viewAs as CareRole };
    }
  }

  // Profile preview: view_profile refines a clinician preview with the
  // specialist perspective (psychologist/psychiatrist). Same posture as
  // view_as — platform admin only, rejected outright otherwise — and it is
  // only meaningful alongside view_as=clinician.
  const viewProfile = req.nextUrl.searchParams.get('view_profile');
  if (viewProfile !== null) {
    const isPlatformAdmin = user.app_metadata?.role === ROLES.ADMIN;
    if (
      !isPlatformAdmin ||
      viewAs !== 'clinician' ||
      !CLINICIAN_PROFILE_VALUES.includes(viewProfile as ClinicianProfile)
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 },
        ),
      };
    }
    if (membership) {
      membership = { ...membership, clinical_profile: viewProfile };
    }
  }

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
