import { NextRequest } from 'next/server';
import { validateFileUrlDomain, getClientIp } from '../../services/apiAuth';

// Direct unit coverage for the two security-critical pure functions in the API
// preamble. Both are named in the threat model (SSRF on client-supplied storage
// URLs; IP spoofing on the rate-limit key) yet were only exercised indirectly
// through one route test each. "A security control with no test does not exist."

describe('validateFileUrlDomain (SSRF guard for client-supplied storage URLs)', () => {
  // jest.setup.ts pins NEXT_PUBLIC_SUPABASE_URL to https://mockproject.supabase.co
  it('accepts a file on the trusted Supabase project host', () => {
    expect(
      validateFileUrlDomain(
        'https://mockproject.supabase.co/storage/v1/object/public/invoices/x.pdf',
      ),
    ).toBe(true);
  });

  it('rejects any other host', () => {
    expect(validateFileUrlDomain('https://evil.example.com/x.pdf')).toBe(false);
    expect(
      validateFileUrlDomain('https://mockproject.supabase.co.evil.com/x.pdf'),
    ).toBe(false);
  });

  it('rejects the file:// scheme (empty host)', () => {
    expect(validateFileUrlDomain('file:///etc/passwd')).toBe(false);
  });

  it('rejects cloud-metadata and private-network IP hosts', () => {
    expect(
      validateFileUrlDomain('http://169.254.169.254/latest/meta-data'),
    ).toBe(false);
    expect(validateFileUrlDomain('http://127.0.0.1/x.pdf')).toBe(false);
    expect(validateFileUrlDomain('http://10.0.0.5/x.pdf')).toBe(false);
  });

  it('rejects a non-https scheme even on the trusted host (base SSRF rule: https only)', () => {
    // The stored file URLs are always https Supabase public URLs, so an http
    // (or gopher/ftp) URL on the trusted host is a downgrade attempt.
    expect(validateFileUrlDomain('http://mockproject.supabase.co/x.pdf')).toBe(
      false,
    );
  });

  it('rejects a malformed / non-URL string without throwing', () => {
    expect(validateFileUrlDomain('not a url')).toBe(false);
    expect(validateFileUrlDomain('')).toBe(false);
  });
});

describe('getClientIp (anti-spoof rate-limit keying — Shostack STRIDE/Spoofing)', () => {
  function reqWith(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/logs', {
      method: 'POST',
      headers: new Headers(headers),
    });
  }

  it('prefers x-real-ip (set and overwritten by the platform)', () => {
    expect(
      getClientIp(
        reqWith({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }),
      ),
    ).toBe('203.0.113.7');
  });

  it('trims whitespace from x-real-ip', () => {
    expect(getClientIp(reqWith({ 'x-real-ip': '  203.0.113.7  ' }))).toBe(
      '203.0.113.7',
    );
  });

  it('uses the LAST x-forwarded-for hop, not the client-supplied leftmost one', () => {
    // The leftmost entry is attacker-controlled; the rightmost is added by the
    // proxy nearest us. Keying on the leftmost would let an attacker mint a
    // fresh rate-limit window per forged value.
    expect(
      getClientIp(
        reqWith({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1, 70.0.0.9' }),
      ),
    ).toBe('70.0.0.9');
  });

  it('falls back to a stable sentinel when no forwarding header is present', () => {
    expect(getClientIp(reqWith({}))).toBe('unknown');
  });
});
