'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { Button, Card, Icon } from '../../components/ui';
import { DATE_LOCALES } from '../../lib/i18n/dictionaries';
import { useI18n } from '../../lib/i18n/I18nProvider';

function SuccessContent() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setReady(true);
      }
    });
  }, [router]);

  if (!ready) {
    return (
      <div
        className="flex-center"
        style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}
      >
        <div
          className="spinner"
          style={{ width: '32px', height: '32px', borderWidth: '3px' }}
        ></div>
        <p className="t-sm t-muted">{t('common.checkingSession')}</p>
      </div>
    );
  }

  const createdAt = searchParams.get('createdAt');
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleString(DATE_LOCALES[locale], {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="flex-center"
      style={{
        minHeight: '100vh',
        flexDirection: 'column',
        padding: 'var(--space-8) var(--space-6)',
      }}
    >
      <Card style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div
          className="flex-center"
          style={{
            width: 72,
            height: 72,
            margin: '0 auto var(--space-5)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--success-bg)',
            color: 'var(--success)',
          }}
        >
          <Icon name="check-circle" size={36} />
        </div>

        <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('success.saved')}</h2>

        {formattedDate && (
          <p
            className="t-sm t-muted"
            style={{ marginBottom: 'var(--space-6)' }}
          >
            {formattedDate}
          </p>
        )}

        <Button block onClick={() => router.push('/dashboard')}>
          <Icon name="plus" size={18} />
          {t('success.newLog')}
        </Button>
      </Card>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
