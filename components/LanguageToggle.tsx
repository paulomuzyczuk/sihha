'use client';

import React from 'react';
import { LOCALES } from '../lib/i18n/dictionaries';
import { useI18n } from '../lib/i18n/I18nProvider';
import { Button } from './ui';

/** Compact PT | EN switch, rendered in every page's chrome. */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('common.languageAria')}
      style={{ display: 'flex', gap: 'var(--space-1)' }}
    >
      {LOCALES.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={locale === option ? 'primary' : 'ghost'}
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          style={{ textTransform: 'uppercase', fontSize: 'var(--fs-caption)' }}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
