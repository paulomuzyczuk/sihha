import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { authorizeCareRequest } from '../../../../services/careTeam';
import { getAdminDbClient } from '../../../../services/db';
import { logger } from '../../../../services/logger';

// The 'invoices' bucket is PRIVATE (financial documents), so an invoice file is
// never served by a permanent public URL. This is the only read path: the owner
// (audit role) requests a specific invoice and gets back a short-lived signed
// URL, minted server-side after care-circle authorization. Admin previews arrive
// as view_as=owner. Mirrors the write-only posture of the rest of the platform —
// nothing is readable without passing through an authorized route first.

const SIGNED_URL_TTL_SECONDS = 60;

// Pull the storage object key (`<uid>/<file>`) out of the stored file_url.
// Handles both the canonical private form (`/object/invoices/<key>`) and any
// legacy public-form rows (`/object/public/invoices/<key>`) — 'invoices'
// appears once, as the bucket segment, so the split is unambiguous.
function invoiceObjectKey(fileUrl: string): string | null {
  try {
    const { pathname } = new URL(fileUrl);
    const marker = '/invoices/';
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const key = pathname.slice(idx + marker.length);
    return key ? decodeURIComponent(key) : null;
  } catch (_e) {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const invoiceParam = new URL(req.url).searchParams.get('invoice');
  const parsed = z.string().uuid().safeParse(invoiceParam);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }

  // Scope the lookup to the caller's own circle recipient. A cross-circle id is
  // therefore indistinguishable from a nonexistent one (both 404) — the
  // endpoint can't be used to probe which invoice ids exist elsewhere.
  const adminDb = getAdminDbClient();
  const { data, error: dbError } = await adminDb
    .from('invoices')
    .select('id, file_url')
    .eq('id', parsed.data)
    .eq('recipient_id', recipient.id)
    .maybeSingle();

  if (dbError) {
    logger.error(
      'invoices/file: lookup failed',
      { route: '/api/invoices/file', action: 'select' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const objectKey = invoiceObjectKey(data.file_url as string);
  if (!objectKey) {
    logger.error('invoices/file: unparseable file_url', {
      route: '/api/invoices/file',
      action: 'parse',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  const { data: signed, error: signError } = await adminDb.storage
    .from('invoices')
    .createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    logger.error(
      'invoices/file: signing failed',
      { route: '/api/invoices/file', action: 'sign' },
      signError ?? undefined,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
