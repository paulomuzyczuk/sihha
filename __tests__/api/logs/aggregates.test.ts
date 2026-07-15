import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/logs/aggregates/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import {
  chain,
  membershipRows,
  RECIPIENT_ROW,
} from '../../helpers/careTeamMock';
import type { MetricSeries } from '../../../services/aggregates';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

function makeRequest(
  period?: string,
  token: string | null = 'valid-token',
  lookback?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL('http://localhost/api/logs/aggregates');
  if (period !== undefined) url.searchParams.set('period', period);
  if (lookback !== undefined) url.searchParams.set('lookback', lookback);
  return new NextRequest(url, { method: 'GET', headers });
}

function mockRole(
  role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
  appMetadataRole?: string,
) {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-1',
        email: 'u@example.com',
        ...(appMetadataRole && { app_metadata: { role: appMetadataRole } }),
      },
    },
    error: null,
  });
  adminTables['care_team_members'] = chain({ data: membershipRows(role) });
}

function makeViewAsRequest(viewAs: string): NextRequest {
  const url = new URL('http://localhost/api/logs/aggregates');
  url.searchParams.set('view_as', viewAs);
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

// A representative slice of the flagship definitions — one metric per
// value_type family, deliberately out of sort order.
const METRIC_DEFS = [
  {
    key: 'medications',
    label: 'Medicações',
    value_type: 'medication_checklist',
    config: {},
    sort_order: 1,
  },
  {
    key: 'mood',
    label: 'Humor',
    value_type: 'scale',
    config: { min: 1, max: 5 },
    sort_order: 0,
  },
  {
    key: 'sleep',
    label: 'Sono',
    value_type: 'time_range',
    config: {},
    sort_order: 2,
  },
  {
    key: 'exercise_type',
    label: 'Tipo de exercício',
    value_type: 'enum',
    config: { options: [{ value: 'walking', label: 'Caminhada' }] },
    sort_order: 3,
  },
  {
    key: 'exercise_minutes',
    label: 'Duração do exercício',
    value_type: 'duration_minutes',
    config: { depends_on: 'exercise_type' },
    sort_order: 4,
  },
  {
    key: 'fed_natasha',
    label: 'Alimentou a Natasha',
    value_type: 'boolean',
    config: {},
    sort_order: 5,
  },
];

function makeEntry(createdAt: string, mood: number) {
  return {
    created_at: createdAt,
    values: {
      mood,
      medications: [{ taken: true }, { taken: false }],
      sleep: { start: '22:00', end: '06:00', hours: 8 },
      exercise_type: 'walking',
      exercise_minutes: 30,
      fed_natasha: true,
      // a value with no metric definition must never reach the response
      notes: 'sensitive free text',
    },
  };
}

describe('GET /api/logs/aggregates (M4: generic per-metric series)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({ data: METRIC_DEFS });
    adminTables['care_log_entries'] = chain({ data: [] });
  });

  it('returns 401 without a token', async () => {
    const res = await GET(makeRequest('daily', null));
    expect(res.status).toBe(401);
  });

  it('returns 403 for caregivers and recipients (write-side roles)', async () => {
    mockRole('caregiver');
    expect((await GET(makeRequest('daily'))).status).toBe(403);
    mockRole('recipient');
    expect((await GET(makeRequest('daily'))).status).toBe(403);
  });

  it('lets the platform admin preview via view_as (role-view switcher)', async () => {
    mockRole('caregiver', 'ADMIN');
    const res = await GET(makeViewAsRequest('clinician'));
    expect(res.status).toBe(200);
  });

  it('returns 403 when a non-admin sends view_as — users are locked to their role', async () => {
    mockRole('caregiver');
    expect((await GET(makeViewAsRequest('clinician'))).status).toBe(403);
    // Even a value matching the stored role is rejected: view_as is admin-only
    mockRole('clinician');
    expect((await GET(makeViewAsRequest('clinician'))).status).toBe(403);
  });

  it('returns 403 for an invalid view_as value, even for the admin', async () => {
    mockRole('caregiver', 'ADMIN');
    expect((await GET(makeViewAsRequest('superuser'))).status).toBe(403);
  });

  it('view_as does not widen access beyond the allowed roles', async () => {
    // Aggregates allow clinician|owner: an admin previewing the recipient
    // role must still be rejected by the role check.
    mockRole('clinician', 'ADMIN');
    expect((await GET(makeViewAsRequest('recipient'))).status).toBe(403);
  });

  it('returns 403 when a clinician probes another circle via ?recipient=', async () => {
    // Caller belongs to recipient-1 only; requesting recipient-2 must not
    // resolve to a membership. This route reads care_log_entries via the
    // service role, so the app-layer scope is the only tenant boundary.
    mockRole('clinician');
    const url = new URL('http://localhost/api/logs/aggregates');
    url.searchParams.set('recipient', 'recipient-2');
    const req = new NextRequest(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect((await GET(req)).status).toBe(403);
  });

  it('scopes both reads to the caller’s own recipient', async () => {
    mockRole('clinician');
    await GET(makeRequest('daily'));
    expect(adminTables['care_log_entries'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
    expect(adminTables['metric_definitions'].eq).toHaveBeenCalledWith(
      'recipient_id',
      RECIPIENT_ROW.id,
    );
  });

  it('returns 400 for an unknown period', async () => {
    mockRole('clinician');
    const res = await GET(makeRequest('yearly'));
    expect(res.status).toBe(400);
  });

  it('defaults to the daily period and its default lookback when none given', async () => {
    mockRole('clinician');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe('daily');
    expect(body.lookback).toBe(14);
  });

  it('accepts a user-defined lookback and echoes it back', async () => {
    mockRole('clinician');
    const res = await GET(makeRequest('weekly', 'valid-token', '26'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lookback).toBe(26);
  });

  it('returns 400 for out-of-range or non-numeric lookback', async () => {
    mockRole('clinician');
    expect(
      (await GET(makeRequest('monthly', 'valid-token', '13'))).status,
    ).toBe(400);
    expect((await GET(makeRequest('daily', 'valid-token', '0'))).status).toBe(
      400,
    );
    expect((await GET(makeRequest('daily', 'valid-token', 'abc'))).status).toBe(
      400,
    );
  });

  it('returns one series per active metric definition, sorted, without raw fields', async () => {
    mockRole('clinician');
    adminTables['care_log_entries'] = chain({
      data: [
        makeEntry('2026-07-01T10:00:00.000Z', 2),
        makeEntry('2026-07-01T18:00:00.000Z', 4),
        makeEntry('2026-07-02T10:00:00.000Z', 5),
      ],
    });

    const res = await GET(makeRequest('daily'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.buckets).toEqual([
      { key: '2026-07-01', logCount: 2 },
      { key: '2026-07-02', logCount: 1 },
    ]);
    const series = body.series as MetricSeries[];
    expect(series.map((s) => s.key)).toEqual([
      'mood',
      'medications',
      'sleep',
      'exercise_type',
      'exercise_minutes',
      'fed_natasha',
    ]);

    const mood = series[0];
    expect(mood.value_type).toBe('scale');
    expect(mood.points.map((p) => p.avg)).toEqual([3, 5]);

    const medications = series[1];
    expect(medications.points[0].pct).toBe(50);

    const sleep = series[2];
    expect(sleep.points[0].avg).toBe(8);

    const exerciseType = series[3];
    expect(exerciseType.points[0].distribution).toEqual({ walking: 2 });

    const exerciseMinutes = series[4];
    expect(exerciseMinutes.points[0]).toMatchObject({ count: 2, sum: 60 });

    const fedNatasha = series[5];
    expect(fedNatasha.points[0].pct).toBe(100);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('notes');
    expect(serialized).not.toContain('lat');
  });

  it('allows the owner role', async () => {
    mockRole('owner');
    const res = await GET(makeRequest('weekly'));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the metric definitions read fails', async () => {
    mockRole('clinician');
    adminTables['metric_definitions'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest('daily'));
    expect(res.status).toBe(500);
  });

  it('returns 500 when the database read fails', async () => {
    mockRole('clinician');
    adminTables['care_log_entries'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest('daily'));
    expect(res.status).toBe(500);
  });
});

function makeCsvRequest(
  format: string,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const url = new URL('http://localhost/api/logs/aggregates');
  url.searchParams.set('period', 'daily');
  url.searchParams.set('format', format);
  return new NextRequest(url, { method: 'GET', headers });
}

describe('GET /api/logs/aggregates?format=csv (clinician export)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    adminTables['metric_definitions'] = chain({ data: METRIC_DEFS });
    adminTables['care_log_entries'] = chain({
      data: [
        makeEntry('2026-07-01T10:00:00.000Z', 2),
        makeEntry('2026-07-01T18:00:00.000Z', 4),
        makeEntry('2026-07-02T10:00:00.000Z', 5),
      ],
    });
  });

  it('returns a CSV attachment for clinicians', async () => {
    mockRole('clinician');
    const res = await GET(makeCsvRequest('csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="care-aggregates-daily-last-14.csv"',
    );

    // text() strips a leading BOM per the WHATWG spec, so the Excel hint is
    // asserted on the raw bytes (EF BB BF) and the content on the decoded rest.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).split('\r\n');
    expect(lines[0]).toBe(
      'period,logs,Humor (avg),Medicações (%),Sono (avg),' +
        'Tipo de exercício,Duração do exercício (count),' +
        'Duração do exercício (min),Alimentou a Natasha (%)',
    );
    expect(lines[1]).toBe('01/07/2026,2,3,50,8,walking:2,2,60,100');
    expect(lines[2]).toBe('02/07/2026,1,5,50,8,walking:1,1,30,100');
  });

  it('allows the owner role and keeps write-side roles out', async () => {
    mockRole('owner');
    expect((await GET(makeCsvRequest('csv'))).status).toBe(200);
    mockRole('caregiver');
    expect((await GET(makeCsvRequest('csv'))).status).toBe(403);
  });

  it('rejects an unknown format', async () => {
    mockRole('clinician');
    expect((await GET(makeCsvRequest('xlsx'))).status).toBe(400);
  });

  it('never includes raw notes in the export', async () => {
    mockRole('clinician');
    const text = await (await GET(makeCsvRequest('csv'))).text();
    expect(text).not.toContain('sensitive free text');
  });
});
