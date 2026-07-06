import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../lib/constants';
import { authorizeCareRequest } from '../../../services/careTeam';
import { logger } from '../../../services/logger';

const invoiceSchema = z.object({
  amount: z.number().positive(),
  fileUrl: z.string().url(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().optional(),
  }),
});

function validateFileUrlDomain(fileUrl: string): boolean {
  try {
    const url = new URL(fileUrl);
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    return url.hostname === supabaseUrl.hostname;
  } catch (_e) {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate and authorize via care-circle membership (M3): the
  //    recipient's own uploads or the owner's audit path.
  const auth = await authorizeCareRequest(req, ['recipient', 'owner']);
  if (!auth.ok) return auth.response;
  const { user, userClient, recipient } = auth;

  // 2. Schema Validation
  let bodyJson;
  try {
    bodyJson = await req.json();
  } catch (_e) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  const parseResult = invoiceSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const payload = parseResult.data;

  // 3. SSRF Protection: strictly validate domain of fileUrl matches Supabase
  if (!validateFileUrlDomain(payload.fileUrl)) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  // 4. Store invoice details through the user-scoped client so RLS enforces
  //    the write (PATIENT|ADMIN + own user_id) as defense in depth behind the
  //    role check above. Write-only by policy, so id/timestamp are generated
  //    here rather than read back.
  //    Ref: Thomas & Hunt, PP Ch.7 (least privilege); Shostack, Threat
  //    Modeling Ch.8 (least privilege / secure defaults).
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const { error: dbError } = await userClient.from('invoices').insert({
    id,
    created_at: createdAt,
    user_id: user.id,
    recipient_id: recipient.id,
    amount: payload.amount,
    file_url: payload.fileUrl,
    lat: payload.location.lat,
    lng: payload.location.lng,
  });

  if (dbError) {
    logger.error(
      'invoices: invoice insert failed',
      { route: '/api/invoices', action: 'insert' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, createdAt });
}
