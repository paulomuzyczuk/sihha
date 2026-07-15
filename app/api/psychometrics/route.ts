import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import type { PsychometricResult } from '../../../services/clinicianCharts';
import { logger } from '../../../services/logger';

type PsychometricRow = {
  test_date: string;
  instrument: string;
  measure: string;
  raw_score: number | null;
  percentile: number | null;
  classification: string | null;
};

// A single test-result row entered by hand. Same fields the PDF-laudo
// ingestion produces, minus provenance (author_id/source_file are set server
// side). raw_score/percentile/classification are optional per instrument.
const testResultSchema = z.object({
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instrument: z.string().min(1).max(200),
  measure: z.string().min(1).max(200),
  rawScore: z.number().finite().nullable().optional(),
  percentile: z.number().min(0).max(100).nullable().optional(),
  classification: z.string().max(200).nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  // The yearly evaluation feeds the clinician dashboard; owners get the same
  // read for the audit views. Admin previews arrive as view_as=clinician.
  const auth = await authorizeCareRequest(req, ['clinician', 'owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const adminDb = getAdminDbClient();
  const { data, error: dbError } = await adminDb
    .from('psychometric_results')
    .select(
      'test_date, instrument, measure, raw_score, percentile, classification',
    )
    .eq('recipient_id', recipient.id)
    .order('test_date', { ascending: true })
    .order('instrument', { ascending: true });

  if (dbError) {
    logger.error(
      'psychometrics: results query failed',
      { route: '/api/psychometrics', action: 'select' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const results: PsychometricResult[] = ((data ?? []) as PsychometricRow[]).map(
    (row) => ({
      testDate: row.test_date,
      instrument: row.instrument,
      measure: row.measure,
      rawScore: row.raw_score === null ? null : Number(row.raw_score),
      percentile: row.percentile === null ? null : Number(row.percentile),
      classification: row.classification,
    }),
  );

  return NextResponse.json({ results });
}

// The psychologist enters test results (M9): the clinician membership
// authorizes, the clinical profile decides which specialist may write — the
// mirror of prescriptions (psychiatrist). Admin previews pass through the
// view_profile substitution in authorizeCareRequest.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['clinician']);
  if (!auth.ok) return auth.response;
  const { user, userClient, membership, recipient } = auth;

  if (membership.clinical_profile !== 'psychologist') {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions' },
      { status: 403 },
    );
  }

  let bodyJson;
  try {
    bodyJson = await req.json();
  } catch (_e) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const parseResult = testResultSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const payload = parseResult.data;

  // Write-only table (like prescriptions): insert through the user-scoped
  // client so RLS enforces psychologist membership + own author_id as defense
  // in depth; id/timestamp are generated here since the row can't be read back.
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const { error: dbError } = await userClient
    .from('psychometric_results')
    .insert({
      id,
      created_at: createdAt,
      author_id: user.id,
      recipient_id: recipient.id,
      test_date: payload.testDate,
      instrument: payload.instrument,
      measure: payload.measure,
      raw_score: payload.rawScore ?? null,
      percentile: payload.percentile ?? null,
      classification: payload.classification ?? null,
    });

  if (dbError) {
    logger.error(
      'psychometrics: insert failed',
      { route: '/api/psychometrics', action: 'insert' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, createdAt }, { status: 201 });
}
