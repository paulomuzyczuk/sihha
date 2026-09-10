import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { ERROR_MESSAGES } from '../lib/constants';
import { getAdminDbClient } from './db';
import { getAuthenticatedUser, getClientIp } from './apiAuth';
import { checkIpRateLimit, checkUserRateLimit } from './rateLimiter';
// Type-only (erased at runtime), so the careTeam <-> institutionAuth cycle
// this creates is compile-time only — no runtime import cycle.
import type { CareRecipientRow } from './careTeam';

// Authorization gateway for the institution-admin surface (/api/admin/*).
// Beyond checking the global JWT ADMIN tier, this scopes the caller to ONE
// institution they administer, so every admin action is confined to their
// own institution. That confinement is the multi-tenant isolation boundary:
// without it, an admin of institution A could enumerate or mutate
// institution B. Ref: docs/saas-institution-layer-plan.md §4.

interface InstitutionAdminMembership {
  institution_id: string;
  institution_role: string;
  institutions: { id: string; name: string; status: string };
}

export type InstitutionSummary = { id: string; name: string };

export type InstitutionAdminResult =
  | { ok: true; user: User; userClient: SupabaseClient; institutionId: string }
  | { ok: false; response: NextResponse };

export type InstitutionListResult =
  | { ok: true; user: User; institutions: InstitutionSummary[] }
  | { ok: false; response: NextResponse };

function deny(
  status: number,
  error: string,
): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

type Caller = { user: User; userClient: SupabaseClient };

// Shared preamble for both entry points below: IP rate limit → JWT
// verification. (The per-user rate limit runs later, only once the caller
// is known to be an admin, so a failed auth doesn't consume anyone's
// per-user budget.)
async function authenticateCaller(
  req: NextRequest,
): Promise<
  { ok: true; caller: Caller } | { ok: false; response: NextResponse }
> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return deny(429, ERROR_MESSAGES.RATE_LIMIT);
  }
  const authed = await getAuthenticatedUser(req);
  if (!authed) return deny(401, ERROR_MESSAGES.UNAUTHORIZED);
  return { ok: true, caller: authed };
}

/** The active institutions the caller is an institution_admin of. */
async function loadAdminInstitutions(
  userId: string,
): Promise<InstitutionAdminMembership[]> {
  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb
    .from('institution_members')
    .select(
      'institution_id, institution_role, institutions!inner(id, name, status)',
    )
    .eq('user_id', userId)
    .eq('institution_role', 'institution_admin');
  if (error) throw error;
  return (data ?? []) as unknown as InstitutionAdminMembership[];
}

// The institution a request targets: an explicit ?institution= (validated
// against the caller's admin memberships) or, when they administer exactly
// one, that one. Administering several without naming one is ambiguous —
// the caller must say which, rather than us guessing and acting on the
// wrong institution.
function resolveTargetInstitution(
  rows: InstitutionAdminMembership[],
  requested: string | null,
): InstitutionAdminMembership | undefined {
  if (requested) return rows.find((r) => r.institution_id === requested);
  return rows.length === 1 ? rows[0] : undefined;
}

/**
 * Full authenticate-and-authorize preamble for institution-admin routes: IP
 * rate limit → JWT verification → institution_admin lookup → target
 * resolution → active-status check → per-user rate limit. On success
 * returns the verified user and the single `institutionId` all downstream
 * queries must be scoped to.
 */
export async function authorizeInstitutionAdminRequest(
  req: NextRequest,
): Promise<InstitutionAdminResult> {
  const pre = await authenticateCaller(req);
  if (!pre.ok) return pre;
  const { user, userClient } = pre.caller;

  let rows: InstitutionAdminMembership[];
  try {
    rows = await loadAdminInstitutions(user.id);
  } catch {
    return deny(500, 'Internal server error');
  }

  const target = resolveTargetInstitution(
    rows,
    req.nextUrl.searchParams.get('institution'),
  );
  // A suspended institution (billing lever) reads as no access — same 403
  // as a non-admin, so a suspended institution can't be probed for
  // existence either.
  if (!target || target.institutions.status !== 'active') {
    return deny(403, 'Forbidden: Insufficient permissions');
  }

  if (!(await checkUserRateLimit(user.id)).allowed) {
    return deny(429, ERROR_MESSAGES.RATE_LIMIT);
  }
  return { ok: true, user, userClient, institutionId: target.institution_id };
}

/**
 * Lists every active institution the caller administers (id + name). Powers
 * the institution switcher, which only renders when this returns more than
 * one. A signed-in non-admin gets an empty list (200), not a 403 — the
 * caller is allowed to ask "which institutions do I run?" and hear "none".
 */
export async function listCallerAdminInstitutions(
  req: NextRequest,
): Promise<InstitutionListResult> {
  const pre = await authenticateCaller(req);
  if (!pre.ok) return pre;
  const { user } = pre.caller;

  let rows: InstitutionAdminMembership[];
  try {
    rows = await loadAdminInstitutions(user.id);
  } catch {
    return deny(500, 'Internal server error');
  }

  if (!(await checkUserRateLimit(user.id)).allowed) {
    return deny(429, ERROR_MESSAGES.RATE_LIMIT);
  }

  const institutions = rows
    .filter((r) => r.institutions.status === 'active')
    .map((r) => ({ id: r.institution_id, name: r.institutions.name }));
  return { ok: true, user, institutions };
}

/**
 * Institution-admin read authorization for a SPECIFIC care circle. Returns
 * the recipient row (in careTeam's CareRecipientRow shape, incl. the
 * institutions.status embed the suspended-institution gate needs) when
 * `user` is an institution_admin of the recipient's institution —
 * otherwise null.
 *
 * This powers institution-wide admin reads: a platform admin may open ANY
 * circle their institution owns without being a care_team_members member of
 * it (authorizeCareRequest synthesizes a membership from this). Scope is
 * tight — a circle in a DIFFERENT institution returns null, preserving the
 * multi-tenant isolation boundary. The active-status decision is
 * intentionally left to authorizeCareRequest, which applies the same gate
 * to every path.
 */
export async function isInstitutionAdminOfRecipient(
  user: User,
  recipientId: string,
): Promise<CareRecipientRow | null> {
  const adminDb = getAdminDbClient();
  const { data: recipient, error } = await adminDb
    .from('care_recipients')
    .select(
      'id, display_name, kind, timezone, log_cadence, geo_lat, geo_lng, geo_radius_m, active, institution_id, institutions!inner(status)',
    )
    .eq('id', recipientId)
    .eq('active', true)
    .single();
  if (error || !recipient) return null;

  const institutionId = (recipient as { institution_id: string })
    .institution_id;
  const { data: membership } = await adminDb
    .from('institution_members')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_role', 'institution_admin')
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (!membership) return null;

  return recipient as unknown as CareRecipientRow;
}
