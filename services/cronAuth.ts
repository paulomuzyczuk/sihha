import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

// A1: fail-closed cron auth. The old check was `header !== \`Bearer ${secret}\``
// — with CRON_SECRET unset, that template literal reads "Bearer undefined",
// so a request sending that exact literal header authenticated. Every path
// here returns false unless CRON_SECRET is a non-empty string AND the header
// matches it byte-for-byte via a constant-time compare.
const BEARER_PREFIX = 'Bearer ';

export function isValidCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get('Authorization');
  if (!header?.startsWith(BEARER_PREFIX)) return false;

  return constantTimeEquals(header.slice(BEARER_PREFIX.length), secret);
}

function constantTimeEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so this pre-check is required
  // — it does leak length, but a length oracle is negligible next to a
  // byte-by-byte timing oracle on the actual secret.
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
