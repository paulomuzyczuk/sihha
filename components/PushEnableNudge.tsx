'use client';

import React, { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n/I18nProvider';
import { Button, Dialog } from './ui';
import {
  PUSH_NUDGE_INTERACTION_THRESHOLD,
  markPushNudgeShown,
  nudgeShownInMonth,
  recordInteraction,
  resetInteractionCount,
} from './pushNudgeTracker';
import { usePushSubscription } from './usePushSubscription';

/** This device's current calendar month as YYYY-MM (local time). */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface PushEnableNudgeProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Tailors the popup copy to the recipient's check-in or the caregiver's shift.
  role?: 'recipient' | 'caregiver';
}

/**
 * The push opt-in nudge (M15 follow-up): after the member has interacted with
 * the app — PUSH_NUDGE_INTERACTION_THRESHOLD clicks on this device — offer the
 * same opt-in as PushReminderOptIn, in case that always-on card went unnoticed.
 * Capped to one nudge per calendar month, and only while push is still
 * available (never once already subscribed). Counting lives in localStorage so
 * it survives reloads.
 */
export default function PushEnableNudge({
  recipientId,
  role = 'recipient',
}: PushEnableNudgeProps) {
  const { t } = useI18n();
  const { state, enable } = usePushSubscription(recipientId);
  const [open, setOpen] = useState(false);
  const bodyKey =
    role === 'caregiver'
      ? 'push.nudgeBodyCaregiver'
      : 'push.nudgeBodyRecipient';

  useEffect(() => {
    // Only offer when push is available (not already subscribed / unsupported),
    // and not if the nudge already fired this calendar month.
    if (state !== 'available') return;
    const storage = window.localStorage;
    const month = currentMonthKey();
    if (nudgeShownInMonth(storage, month)) return;

    const onClick = () => {
      if (recordInteraction(storage) < PUSH_NUDGE_INTERACTION_THRESHOLD) return;
      markPushNudgeShown(storage, month);
      resetInteractionCount(storage);
      setOpen(true);
      document.removeEventListener('click', onClick);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state]);

  return (
    <Dialog
      open={open}
      title={t('push.nudgeTitle')}
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('push.nudgeDismiss')}
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              enable();
            }}
          >
            {t('push.enable')}
          </Button>
        </>
      }
    >
      <p className="t-body">{t(bodyKey)}</p>
    </Dialog>
  );
}
