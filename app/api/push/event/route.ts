import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDbClient } from '../../../../services/db';
import { checkIpRateLimit } from '../../../../services/rateLimiter';
import { getClientIp } from '../../../../services/apiAuth';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { logger } from '../../../../services/logger';

// Records a push-notification lifecycle event reported by the service worker
// (public/push-sw.js): 'displayed' when the push fires, 'opened' on tap. No user
// auth — the notificationId is an unguessable per-send id delivered only to that
// user's own device, so it IS the capability; the event is attributed to the
// user on the matching 'sent' row. IP rate-limited; unknown ids are a no-op so
// the route can't be used to write arbitrary analytics.

const EventSchema = z.object({
  notificationId: z.string().uuid(),
  event: z.enum(['displayed', 'opened']),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.RATE_LIMIT },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const { notificationId, event } = parsed.data;

  const adminDb = getAdminDbClient();
  // Attribute to the user on the originating 'sent' row; ignore unknown ids.
  const { data: origin } = await adminDb
    .from('push_events')
    .select('user_id, kind')
    .eq('notification_id', notificationId)
    .eq('event', 'sent')
    .maybeSingle();
  if (!origin) {
    return NextResponse.json({ ok: true }, { status: 202 }); // unknown/expired
  }

  const { error } = await adminDb.from('push_events').upsert(
    {
      notification_id: notificationId,
      user_id: origin.user_id,
      kind: origin.kind,
      event,
    },
    { onConflict: 'notification_id,event', ignoreDuplicates: true },
  );
  if (error) {
    logger.error(
      'push/event: insert failed',
      { route: '/api/push/event', event },
      error,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
