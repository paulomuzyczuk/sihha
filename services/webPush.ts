import webpush from 'web-push';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { withOutboundTimeout } from './outboundTimeout';
import { logger } from './logger';

// Web push dispatch (M15). VAPID identifies this server to the browser push
// services; the public key also lives client-side (NEXT_PUBLIC_) because
// PushManager.subscribe needs it as applicationServerKey. Payloads are
// encrypted per-subscription by web-push — the push services never read them.
//
// Analytics (M16): each send carries a per-device notificationId and records a
// 'sent' push_events row; the service worker reports 'displayed'/'opened' back
// through /api/push/event, since web push exposes no native delivery/open data.

export interface WebPushMessage {
  title: string;
  body: string;
  /** Path the notification opens on tap; the service worker defaults it */
  url?: string;
  /** Per-send id injected by sendPushToUsers so the service worker can attribute
   * 'displayed'/'opened' events back to this send. */
  notificationId?: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function webPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

function configureVapid(): void {
  // Subject is a contact URL the push services may use to reach the operator
  const subject =
    process.env.VAPID_SUBJECT ?? `mailto:${process.env.ADMIN_EMAIL}`;
  webpush.setVapidDetails(
    subject,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

/**
 * Records that a push was accepted by the push service, for open-rate stats.
 * A failed insert is ERROR-logged but never affects delivery semantics (A22):
 * open-rate math missing a 'sent' row is an observability bug, and a silent
 * one poisons the engagement aggregates (D7) invisibly.
 */
async function recordPushSent(
  adminDb: SupabaseClient,
  notificationId: string,
  userId: string,
  kind: string,
): Promise<void> {
  const { error } = await adminDb.from('push_events').insert({
    notification_id: notificationId,
    user_id: userId,
    kind,
    event: 'sent',
  });
  if (error) {
    logger.error(
      'webPush: push_events sent-row insert failed',
      { service: 'webPush', action: 'record-sent', kind },
      error,
    );
  }
}

/**
 * Sends one notification to every stored subscription of the given users.
 * Dead subscriptions (HTTP 404/410 from the push service) are pruned in place.
 * Records a 'sent' push_events row per accepted send. Returns the accepted count.
 */
export async function sendPushToUsers(
  adminDb: SupabaseClient,
  userIds: string[],
  message: WebPushMessage,
  kind = 'fill_reminder',
): Promise<number> {
  if (userIds.length === 0) return 0;
  if (!webPushConfigured()) {
    logger.warn('webPush: VAPID keys not configured, skipping push', {
      service: 'webPush',
      action: 'skip',
    });
    return 0;
  }
  configureVapid();

  const { data: rows, error } = await adminDb
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) {
    logger.error(
      'webPush: subscription query failed',
      { service: 'webPush', action: 'select' },
      error,
    );
    return 0;
  }

  // A zero return must be explainable (A22): "nobody has a device" is
  // normal, "the query failed" is an incident — they were indistinguishable.
  if ((rows ?? []).length === 0) {
    logger.info('webPush: no subscribed devices for the target users', {
      service: 'webPush',
      action: 'no-devices',
      userCount: userIds.length,
    });
    return 0;
  }

  let sent = 0;
  for (const row of (rows ?? []) as PushSubscriptionRow[]) {
    const notificationId = randomUUID();
    if (
      await sendToSubscription(adminDb, row, { ...message, notificationId })
    ) {
      await recordPushSent(adminDb, notificationId, row.user_id, kind);
      sent++;
    }
  }
  return sent;
}

async function sendToSubscription(
  adminDb: SupabaseClient,
  row: PushSubscriptionRow,
  message: WebPushMessage,
): Promise<boolean> {
  try {
    await withOutboundTimeout(
      webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(message),
      ),
      'webPush:sendNotification',
    );
    return true;
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 404/410 = the browser dropped the subscription — prune, don't retry
    if (statusCode === 404 || statusCode === 410) {
      await adminDb.from('push_subscriptions').delete().eq('id', row.id);
      logger.info('webPush: pruned expired subscription', {
        service: 'webPush',
        action: 'prune',
        subscriptionId: row.id,
      });
      return false;
    }
    logger.error(
      'webPush: send failed',
      { service: 'webPush', action: 'send', statusCode },
      err,
    );
    return false;
  }
}
