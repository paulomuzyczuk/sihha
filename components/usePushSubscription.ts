import { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { supabase } from './supabaseClient';

// Shared push-subscription state machine (M15), used by both the always-on
// PushReminderOptIn card and the one-time PushEnableNudge popup so the two
// surfaces can't drift on what "available"/"denied"/"subscribed" means.

export const PUSH_SW_PATH = '/push-sw.js';

export type PushOptInState =
  | 'checking'
  | 'available'
  | 'subscribed'
  | 'denied'
  | 'error'
  | 'hidden';

/** PushManager.subscribe wants the VAPID public key as a Uint8Array. */
function vapidKeyBytes(base64Url: string): Uint8Array {
  const padded = base64Url.padEnd(
    base64Url.length + ((4 - (base64Url.length % 4)) % 4),
    '=',
  );
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function usePushSubscription(recipientId?: string) {
  const [state, setState] = useState<PushOptInState>('checking');
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const detect = async () => {
      if (
        !vapidPublicKey ||
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setState('hidden');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const registration =
        await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? 'subscribed' : 'available');
    };
    detect().catch(() => setState('hidden'));
  }, [vapidPublicKey]);

  const enable = async () => {
    setState('checking');
    try {
      const registration = await navigator.serviceWorker.register(PUSH_SW_PATH);
      if ((await Notification.requestPermission()) !== 'granted') {
        setState('denied');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(
          vapidPublicKey as string,
        ) as unknown as BufferSource,
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setState('error');
        return;
      }
      const res = await fetch(
        recipientId
          ? withRecipient(API_ROUTES.PUSH, recipientId)
          : API_ROUTES.PUSH,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(subscription.toJSON()),
        },
      );
      setState(res.ok ? 'subscribed' : 'error');
    } catch {
      setState('error');
    }
  };

  return { state, enable };
}
