import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from './logger';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const WINDOW_MS = 60_000;
// The dashboard SPA legitimately fires a burst of authorized reads per tab
// visit (circles, metrics, goals, aggregates, psychometrics), so the old
// blanket 5/min starved normal navigation with 429s. 60/min per user keeps a
// wide margin over real usage while still capping abuse; the IP tier is
// looser because it fires before auth and a household shares one NAT'd IP.
export const USER_MAX_REQUESTS = 60;
export const IP_MAX_REQUESTS = 120;
const WINDOW = '60 s' as const;

// ---------------------------------------------------------------------------
// Backend selection.
//
// When Redis REST credentials are present (UPSTASH_REDIS_REST_* or the Vercel
// Upstash/KV integration's KV_REST_API_* — see resolveRedisCredentials), the
// limiter uses a SHARED Upstash (Redis) sliding window, so the limit holds across
// all serverless instances. Otherwise it falls back to an IN-MEMORY store, which is
// per-instance only: on a serverless platform (Vercel) each instance has its
// own memory, so the in-memory limit is best-effort and primarily useful for
// local/dev. Configure Upstash in production.
//
// The public surface (checkIpRateLimit / checkUserRateLimit / resetRateLimiter)
// is the only API, so the backend is swappable behind it.
//   Ref: Thomas & Hunt, The Pragmatic Programmer, Ch.5, Tip 48 ("If it's
//   important enough to be global, wrap it in an API"); Nygard, Release It!
//   Ch.5 (Steady State) for the in-memory eviction below.
// ---------------------------------------------------------------------------

interface RateLimitStore {
  check(key: string): Promise<RateLimitResult>;
  reset(): void;
}

// Above this many tracked keys we sweep fully-expired entries before recording a
// new hit. Without a drain the map grows once per distinct key and never shrinks
// — an unbounded structure / memory leak (Nygard, Steady State).
const SWEEP_THRESHOLD = 10_000;

class InMemoryStore implements RateLimitStore {
  private store = new Map<string, number[]>();

  constructor(private maxRequests: number) {}

  reset(): void {
    this.store.clear();
  }

  private sweepExpired(cutoff: number): void {
    const expired: string[] = [];
    this.store.forEach((history, key) => {
      if (history.length === 0 || history[history.length - 1] <= cutoff) {
        expired.push(key);
      }
    });
    expired.forEach((key) => this.store.delete(key));
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Bound memory before recording a potentially new key.
    if (this.store.size > SWEEP_THRESHOLD) {
      this.sweepExpired(cutoff);
    }

    const history = this.store.get(key) || [];

    // Purge outdated records from the sliding window.
    const active = history.filter((t) => t > cutoff);

    if (active.length < this.maxRequests) {
      active.push(now);
      this.store.set(key, active);
      return { allowed: true, retryAfterMs: 0 };
    }

    // Persist the pruned window so the stored entry holds only active hits.
    this.store.set(key, active);

    const oldest = active[0];
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + WINDOW_MS - now),
    };
  }
}

class UpstashStore implements RateLimitStore {
  private limiter: Ratelimit;

  constructor(redis: Redis, prefix: string, maxRequests: number) {
    this.limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, WINDOW),
      prefix,
    });
  }

  // No-op: the shared store is not cleared between unit tests (tests run against
  // the in-memory backend). Provided to satisfy the interface.
  reset(): void {}

  async check(key: string): Promise<RateLimitResult> {
    const { success, reset } = await this.limiter.limit(key);
    return {
      allowed: success,
      retryAfterMs: success ? 0 : Math.max(0, reset - Date.now()),
    };
  }
}

/**
 * Resolves the Redis REST credentials from the environment, accepting either the
 * @upstash/redis-native names (UPSTASH_REDIS_REST_*) or the ones the Vercel
 * Upstash/KV marketplace integration injects (KV_REST_API_*). Kept pure and
 * injectable so the var-name precedence stays unit-testable.
 *
 * Prod incident (2026-07-14): the connected Upstash store exposed its creds as
 * KV_REST_API_URL/TOKEN while the limiter only read empty UPSTASH_REDIS_REST_*
 * placeholders — so `url && token` was falsy and it silently fell back to the
 * per-instance in-memory store, leaving no global ceiling. Empty UPSTASH_ stubs
 * are falsy, so the `||` correctly falls through to the real KV_ values.
 */
export function resolveRedisCredentials(
  env: Record<string, string | undefined> = process.env,
): { url: string | undefined; token: string | undefined } {
  return {
    url: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN,
  };
}

function createStores(): { ip: RateLimitStore; user: RateLimitStore } {
  const { url, token } = resolveRedisCredentials();

  // Startup observability: which backend is live. A missing/empty Redis
  // credential silently falls back to the per-instance in-memory store (no
  // global ceiling), which is otherwise invisible — log it so it's greppable.
  logger.info('rateLimiter backend selected', {
    backend: url && token ? 'upstash-shared' : 'in-memory-per-instance',
    hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    hasKvUrl: Boolean(process.env.KV_REST_API_URL),
    hasKvToken: Boolean(process.env.KV_REST_API_TOKEN),
  });

  if (url && token) {
    const redis = new Redis({ url, token });
    return {
      ip: new UpstashStore(redis, 'sihha:rl:ip', IP_MAX_REQUESTS),
      user: new UpstashStore(redis, 'sihha:rl:user', USER_MAX_REQUESTS),
    };
  }

  return {
    ip: new InMemoryStore(IP_MAX_REQUESTS),
    user: new InMemoryStore(USER_MAX_REQUESTS),
  };
}

const stores = createStores();

/**
 * Resets the in-memory stores. Used primarily for unit test isolation; a no-op
 * for the shared Upstash backend.
 */
export function resetRateLimiter(): void {
  stores.ip.reset();
  stores.user.reset();
}

// Note: these are intentionally NOT `async` functions — the empty-argument guard
// throws synchronously, while the store call returns the pending promise.
export function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
  if (!ip) {
    throw new Error('checkIpRateLimit: expected non-empty ip, got ""');
  }
  return stores.ip.check(ip);
}

export function checkUserRateLimit(userId: string): Promise<RateLimitResult> {
  if (!userId) {
    throw new Error('checkUserRateLimit: expected non-empty userId, got ""');
  }
  return stores.user.check(userId);
}
