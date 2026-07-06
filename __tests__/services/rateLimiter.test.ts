import {
  checkIpRateLimit,
  checkUserRateLimit,
  resetRateLimiter,
} from '../../services/rateLimiter';

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

    it('should allow up to 5 requests', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await checkIpRateLimit(testIp);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block the 6th request', async () => {
      for (let i = 0; i < 5; i++) {
        await checkIpRateLimit(testIp);
      }
      const result = await checkIpRateLimit(testIp);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should reset rate limits after the window expires (60s)', async () => {
      for (let i = 0; i < 5; i++) {
        await checkIpRateLimit(testIp);
      }

      // 6th blocked
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

    it('should allow up to 5 requests', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await checkUserRateLimit(testUserId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block the 6th request', async () => {
      for (let i = 0; i < 5; i++) {
        await checkUserRateLimit(testUserId);
      }
      const result = await checkUserRateLimit(testUserId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track IP and User ID limits independently', async () => {
      // Exhaust User limit
      for (let i = 0; i < 5; i++) {
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
