'use client';

import React from 'react';
import { useI18n } from '../lib/i18n/I18nProvider';
import { Alert, Button, Card, Icon } from './ui';
import { usePushSubscription } from './usePushSubscription';

// Device-reminder opt-in (M15): registers the push service worker and stores
// the browser subscription via /api/push so the 21h fill-reminder cron can
// notify this device. Renders nothing where push is unsupported (or already
// active) — the e-mail reminder covers those members regardless.

interface PushReminderOptInProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Who's looking — the opt-in copy speaks to the recipient's own check-in or
  // the caregiver's shift log.
  role?: 'recipient' | 'caregiver';
}

export default function PushReminderOptIn({
  recipientId,
  role = 'recipient',
}: PushReminderOptInProps) {
  const { t } = useI18n();
  const { state, enable } = usePushSubscription(recipientId);
  const bodyKey =
    role === 'caregiver' ? 'push.cardBodyCaregiver' : 'push.cardBodyRecipient';

  if (state === 'hidden' || state === 'checking' || state === 'subscribed') {
    return null;
  }

  return (
    <Card style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <Icon name="bell" size={20} />
        <div className="stack" style={{ gap: 'var(--space-2)', flex: 1 }}>
          <span className="t-sm t-strong">{t('push.cardTitle')}</span>
          <span className="t-sm t-muted">{t(bodyKey)}</span>
          {state === 'denied' && (
            <Alert variant="warning" style={{ marginBottom: 0 }}>
              {t('push.denied')}
            </Alert>
          )}
          {state === 'error' && (
            <Alert variant="danger" style={{ marginBottom: 0 }}>
              {t('push.error')}
            </Alert>
          )}
          {state !== 'denied' && (
            <div>
              <Button size="sm" onClick={enable}>
                {t('push.enable')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
