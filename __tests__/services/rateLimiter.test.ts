import {
  checkIpRateLimit,
  checkUserRateLimit,
  resetRateLimiter,
  resolveRedisCredentials,
  IP_MAX_REQUESTS,
  USER_MAX_REQUESTS,
} from '../../services/rateLimiter';

describe('resolveRedisCredentials', () => {
  const upstash = {
    UPSTASH_REDIS_REST_URL: 'https://native.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'native-token',
  };
  const kv = {
    KV_REST_API_URL: 'https://kv.upstash.io',
    KV_REST_API_TOKEN: 'kv-token',
  };

  it('prefers the @upstash/redis-native var names when set', () => {
    expect(resolveRedisCredentials({ ...kv, ...upstash })).toEqual({
      url: 'https://native.upstash.io',
      token: 'native-token',
    });
  });

  it('falls back to the Vercel Upstash/KV integration var names', () => {
    // The marketplace integration injects KV_REST_API_* rather than
    // UPSTASH_REDIS_REST_*; the limiter must still find the credentials.
    expect(resolveRedisCredentials(kv)).toEqual({
      url: 'https://kv.upstash.io',
      token: 'kv-token',
    });
  });

  it('treats empty UPSTASH_ placeholders as absent and uses KV_ values', () => {
    // Reproduces prod: empty UPSTASH_REDIS_REST_* stubs shadowing real KV creds.
    const env = {
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      ...kv,
    };
    expect(resolveRedisCredentials(env)).toEqual({
      url: 'https://kv.upstash.io',
      token: 'kv-token',
    });
  });

  it('returns undefined for both when no backend is configured', () => {
    expect(resolveRedisCredentials({})).toEqual({
      url: undefined,
      token: undefined,
    });
  });
});

describe('rateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRateLimiter(); // Helper to clear the memory store between tests
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('IP Rate Limiter', () => {
    const testIp = '192.168.1.1';

    it(`should allow up to ${IP_MAX_REQUESTS} requests`, async () => {
      for (let i = 0; i < IP_MAX_REQUESTS; i++) {
        const result = await checkIpRateLimit(testIp);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block the request after the limit', async () => {
      for (let i = 0; i < IP_MAX_REQUESTS; i++) {
        await checkIpRateLimit(testIp);
      }
      const result = await checkIpRateLimit(testIp);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should reset rate limits after the window expires (60s)', async () => {
      for (let i = 0; i < IP_MAX_REQUESTS; i++) {
        await checkIpRateLimit(testIp);
      }

      // Next one blocked
      expect((await checkIpRateLimit(testIp)).allowed).toBe(false);

      // Fast-forward 60.1 seconds
      jest.advanceTimersByTime(60100);

      // Should be allowed again
      const result = await checkIpRateLimit(testIp);
      expect(result.allowed).toBe(true);
    });

    it('should throw an error for empty IP', () => {
      expect(() => {
        checkIpRateLimit('');
      }).toThrow('checkIpRateLimit: expected non-empty ip, got ""');
    });
  });

  describe('User ID Rate Limiter', () => {
    const testUserId = 'user-uuid-123';

    it(`should allow up to ${USER_MAX_REQUESTS} requests`, async () => {
      for (let i = 0; i < USER_MAX_REQUESTS; i++) {
        const result = await checkUserRateLimit(testUserId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block the request after the limit', async () => {
      for (let i = 0; i < USER_MAX_REQUESTS; i++) {
        await checkUserRateLimit(testUserId);
      }
      const result = await checkUserRateLimit(testUserId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('leaves room for a full clinician dashboard visit within one window', () => {
      // circles + metrics + goals + aggregates + psychometrics + tab
      // revisits — the burst that used to 429 under the old 5/min limit
      expect(USER_MAX_REQUESTS).toBeGreaterThanOrEqual(20);
      expect(IP_MAX_REQUESTS).toBeGreaterThanOrEqual(USER_MAX_REQUESTS);
    });

    it('should track IP and User ID limits independently', async () => {
      // Exhaust User limit
      for (let i = 0; i < USER_MAX_REQUESTS; i++) {
        await checkUserRateLimit(testUserId);
      }
      expect((await checkUserRateLimit(testUserId)).allowed).toBe(false);

      // IP should still be allowed
      expect((await checkIpRateLimit('192.168.1.1')).allowed).toBe(true);
    });

    it('should throw an error for empty User ID', () => {
      expect(() => {
        checkUserRateLimit('');
      }).toThrow('checkUserRateLimit: expected non-empty userId, got ""');
    });
  });
});
