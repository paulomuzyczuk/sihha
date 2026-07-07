import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeCareRequest } from '../../../../services/careTeam';
import {
  aggregateMetricSeries,
  AggregateMetricDefinition,
  CareLogEntryValuesRow,
  DEFAULT_LOOKBACK,
  MAX_LOOKBACK,
  lookbackWindowDays,
} from '../../../../services/aggregates';
import { aggregatesToCsv } from '../../../../services/aggregatesCsv';
import { logger } from '../../../../services/logger';

// `lookback` = how many periods into the past to cover ("last N days/weeks/
// months"), user-defined on the dashboard. Bounds are validated against the
// selected period after parsing, since the maximum differs per period.
// `format=csv` returns the same aggregate data as a downloadable file — still
// aggregates only, so the export carries no more than the dashboard shows.
const QuerySchema = z
  .object({
    period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    lookback: z.coerce.number().int().min(1).optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine(
    (q) => q.lookback === undefined || q.lookback <= MAX_LOOKBACK[q.period],
    { message: 'lookback out of range' },
  );

// care_log_entries is write-only for clients under RLS, so reads go through
// the service role here and the response carries ONLY per-metric aggregate
// series — never notes, coordinates, or raw rows. Aggregation is generic
// (M4): one series per active metric definition, dispatched on value_type.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['clinician', 'owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const parsed = QuerySchema.safeParse({
    period: req.nextUrl.searchParams.get('period') ?? undefined,
    lookback: req.nextUrl.searchParams.get('lookback') ?? undefined,
    format: req.nextUrl.searchParams.get('format') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const { period, format } = parsed.data;
  const lookback = parsed.data.lookback ?? DEFAULT_LOOKBACK[period];

  const since = new Date(
    Date.now() - lookbackWindowDays(period, lookback) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const adminDb = getAdminDbClient();

  const { data: defRows, error: defError } = await adminDb
    .from('metric_definitions')
    .select('key, label, value_type, config, sort_order')
    .eq('recipient_id', recipient.id)
    .eq('active', true);
  if (defError) {
    logger.error(
      'aggregates: metric_definitions read failed',
      { route: '/api/logs/aggregates', action: 'definitions', period },
      defError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const { data, error } = await adminDb
    .from('care_log_entries')
    .select('created_at, values')
    .eq('recipient_id', recipient.id)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error(
      'aggregates: care_log_entries read failed',
      { route: '/api/logs/aggregates', action: 'select', period },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const { buckets, series } = aggregateMetricSeries(
    (defRows ?? []) as AggregateMetricDefinition[],
    (data ?? []) as CareLogEntryValuesRow[],
    period,
  );

  if (format === 'csv') {
    // Neutral filename on purpose — no recipient name, so a downloaded file
    // sitting in a shared machine's folder does not itself leak who it is
    // about. BOM keeps Excel from misreading UTF-8 metric labels.
    const filename = `care-aggregates-${period}-last-${lookback}.csv`;
    return new NextResponse('\ufeff' + aggregatesToCsv({ buckets, series }), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ period, lookback, buckets, series });
}
