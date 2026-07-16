'use client';

import React from 'react';
import { Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { TranslationKey } from '../lib/i18n/dictionaries';

// The recipient's read-only "Metas de Longo Prazo" tab (M6). Where the goals
// dashboard tracks the month-to-month behavioural targets, this tab frames the
// point of the arrangement: the long-term life goals the behavioural system
// moves toward. The goals here are generic examples (localised); a deployment
// swaps them for the recipient's own. Writes nothing and fetches nothing.
const GOAL_KEYS: TranslationKey[] = [
  'longterm.goal1',
  'longterm.goal2',
  'longterm.goal3',
];

export default function LongTermGoalsView() {
  const { t } = useI18n();

  return (
    <Card wide className="stack" style={{ gap: 'var(--space-5)' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('longterm.title')}</h3>
        <p className="t-body t-muted">{t('longterm.intro')}</p>
      </div>

      <section className="stack" style={{ gap: 'var(--space-3)' }}>
        <h4 className="t-h4">{t('longterm.heading')}</h4>
        <ol
          className="stack"
          style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}
        >
          {GOAL_KEYS.map((key) => (
            <li key={key} className="t-body">
              {t(key)}
            </li>
          ))}
        </ol>
      </section>
    </Card>
  );
}
