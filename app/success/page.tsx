'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
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
        <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>
          {t('common.checkingSession')}
        </p>
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
        padding: '2rem 1.5rem',
      }}
    >
      <div className="card" style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle
              cx="32"
              cy="32"
              r="32"
              fill="hsl(var(--success))"
              opacity="0.15"
            />
            <circle
              cx="32"
              cy="32"
              r="24"
              fill="hsl(var(--success))"
              opacity="0.25"
            />
            <path
              d="M20 32l9 9 16-16"
              stroke="hsl(var(--success))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 style={{ marginBottom: '0.5rem' }}>{t('success.saved')}</h2>

        {formattedDate && (
          <p
            style={{
              color: 'hsl(var(--text-secondary))',
              fontSize: '0.9rem',
              marginBottom: '2rem',
            }}
          >
            {formattedDate}
          </p>
        )}

        <button className="btn" onClick={() => router.push('/dashboard')}>
          {t('success.newLog')}
        </button>
      </div>
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
