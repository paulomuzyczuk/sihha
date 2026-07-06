import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { ERROR_MESSAGES } from '../lib/constants';
import { checkIpRateLimit, checkUserRateLimit } from './rateLimiter';

// Single authoritative copy of the API request preamble (IP rate limit → JWT
// extraction → user verification → role check → per-user rate limit). Every
// authenticated route shared this logic copy-pasted; centralising it keeps the
// authorization contract in one place.
//   Ref: Thomas & Hunt, The Pragmatic Programmer, Ch.2, Tip 15 (DRY) — one
//   authoritative representation of each piece of knowledge.

/**
 * Best-effort client IP for rate-limit keying.
 *
 * x-forwarded-for is appended to by every hop and its LEFTMOST entry is
 * supplied by the client, so it is forgeable and must never be trusted as
 * identity — keying on it lets an attacker mint a fresh window per forged
 * value. Prefer values the upstream platform sets and overwrites:
 * `x-real-ip` (Vercel sets it to the real connecting address), then the LAST
 * x-forwarded-for hop (added by the proxy nearest us), then a stable sentinel.
 *   Ref: Shostack, Threat Modeling, Ch.3 (STRIDE / Spoofing).
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return 'unknown';
}

/**
 * Verifies the request's Bearer JWT and returns the user together with a
 * user-scoped Supabase client (carrying the caller's JWT, so it is subject to
 * RLS). Returns null when the header is absent/malformed or the token is
 * invalid. Single authoritative token-verification path shared across routes.
 */
export async function getAuthenticatedUser(
  req: NextRequest,
): Promise<{ user: User; userClient: SupabaseClient } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    },
  );

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  return { user, userClient };
}

export type AuthResult =
  | { ok: true; user: User; userClient: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Runs the full authenticate-and-authorize preamble shared by the protected API
 * routes. On success returns the verified `user` and a user-scoped Supabase
 * client (carrying the caller's JWT, so it is subject to RLS). On any failure
 * returns the ready-to-send error `response`.
 */
export async function authorizeRequest(
  req: NextRequest,
  allowedRoles: readonly string[],
): Promise<AuthResult> {
  // 1. IP-based rate limiting (early reject prior to CPU-heavy JWT parsing)
  const ip = getClientIp(req);
  if (!(await checkIpRateLimit(ip)).allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ERROR_MESSAGES.RATE_LIMIT },
        { status: 429 },
      ),
    };
  }

  // 2. JWT extraction + signature verification
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

  // 3. Role authorization check
  if (!allowedRoles.includes(user.app_metadata?.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 },
      ),
    };
  }

  // 4. Per-user sliding-window rate limit
  if (!(await checkUserRateLimit(user.id)).allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ERROR_MESSAGES.RATE_LIMIT },
        { status: 429 },
      ),
    };
  }

  return { ok: true, user, userClient };
}
