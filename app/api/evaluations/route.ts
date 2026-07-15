import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { authorizeCareRequest } from '../../../services/careTeam';
import { validateFileUrlDomain } from '../../../services/apiAuth';
import { logger } from '../../../services/logger';

const evaluationSchema = z.object({
  fileUrl: z.string().url(),
  notes: z.string().max(1000).optional(),
});

// Evaluation-document registration (M10): the psychologist stores the raw
// test-result PDF. The clinician membership authorizes, the clinical profile
// decides which specialist may upload — the mirror of prescriptions
// (psychiatrist). Admin previews pass through the view_profile substitution in
// authorizeCareRequest.
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

  const parseResult = evaluationSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const payload = parseResult.data;

  // SSRF protection: the document must live on this project's own storage
  if (!validateFileUrlDomain(payload.fileUrl)) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  // Write-only table (like prescriptions): insert through the user-scoped
  // client so RLS enforces psychologist membership + own user_id as defense in
  // depth; id/timestamp are generated here since the row can't be read back.
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const { error: dbError } = await userClient.from('evaluations').insert({
    id,
    created_at: createdAt,
    user_id: user.id,
    recipient_id: recipient.id,
    file_url: payload.fileUrl,
    notes: payload.notes ?? null,
  });

  if (dbError) {
    logger.error(
      'evaluations: insert failed',
      { route: '/api/evaluations', action: 'insert' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, createdAt }, { status: 201 });
}
