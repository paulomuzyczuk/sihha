import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const WINDOW = '60 s' as const;

// ---------------------------------------------------------------------------
// Backend selection.
//
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, the limiter
// uses a SHARED Upstash (Redis) sliding window, so the limit holds across all
// serverless instances. Otherwise it falls back to an IN-MEMORY store, which is
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

    if (active.length < MAX_REQUESTS) {
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

  constructor(redis: Redis, prefix: string) {
    this.limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS, WINDOW),
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

function createStores(): { ip: RateLimitStore; user: RateLimitStore } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    return {
      ip: new UpstashStore(redis, 'sihha:rl:ip'),
      user: new UpstashStore(redis, 'sihha:rl:user'),
    };
  }

  return { ip: new InMemoryStore(), user: new InMemoryStore() };
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
