import { NextRequest } from 'next/server';
import { isValidCronRequest } from '../../services/cronAuth';

function makeRequest(header: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (header !== null) headers['Authorization'] = header;
  return new NextRequest('http://localhost/api/cron/missing-log', {
    headers,
  });
}

describe('isValidCronRequest', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('accepts the correct bearer secret', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isValidCronRequest(makeRequest('Bearer cron-secret'))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isValidCronRequest(makeRequest('Bearer wrong'))).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isValidCronRequest(makeRequest(null))).toBe(false);
  });

  it('rejects a non-Bearer scheme', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isValidCronRequest(makeRequest('Basic cron-secret'))).toBe(false);
  });

  it('fails closed when CRON_SECRET is unset, even against the literal "Bearer undefined"', () => {
    delete process.env.CRON_SECRET;
    expect(isValidCronRequest(makeRequest('Bearer undefined'))).toBe(false);
  });

  it('fails closed when CRON_SECRET is an empty string', () => {
    process.env.CRON_SECRET = '';
    expect(isValidCronRequest(makeRequest('Bearer '))).toBe(false);
  });
});
