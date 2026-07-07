'use client';

import React from 'react';
import { LOCALES } from '../lib/i18n/dictionaries';
import { useI18n } from '../lib/i18n/I18nProvider';

/** Compact PT | EN switch, rendered in every page's chrome. */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('common.languageAria')}
      style={{ display: 'flex', gap: '0.25rem' }}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={locale === option ? 'btn' : 'btn btn-secondary'}
          aria-pressed={locale === option}
          style={{
            width: 'auto',
            padding: '0.35rem 0.6rem',
            fontSize: '0.75rem',
            borderRadius: '8px',
            textTransform: 'uppercase',
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
