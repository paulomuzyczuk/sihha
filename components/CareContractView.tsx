'use client';

import React from 'react';
import { Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { TranslationKey } from '../lib/i18n/dictionaries';

// The recipient's read-only view of the care agreement (M6). Unlike the other
// patient tabs this one writes nothing and fetches nothing — it just shows the
// signed "contrato de convivência" so the recipient can revisit, in one place,
// what is expected of them and what their care team owes them in return.
//
// The clauses here are generic examples (localised via the dictionaries), not a
// specific recipient's signed terms. When per-recipient agreements are stored
// in Supabase, swap these key lists for that data.
const RECIPIENT_CLAUSE_KEYS: TranslationKey[] = [
  'contract.recipient1',
  'contract.recipient2',
  'contract.recipient3',
  'contract.recipient4',
  'contract.recipient5',
];

const CARETAKER_CLAUSE_KEYS: TranslationKey[] = [
  'contract.caretaker1',
  'contract.caretaker2',
  'contract.caretaker3',
  'contract.caretaker4',
];

const BREACH_CLAUSE_KEYS: TranslationKey[] = [
  'contract.breach1',
  'contract.breach2',
  'contract.breach3',
];

interface ClauseSectionProps {
  heading: string;
  clauses: string[];
}

function ClauseSection({ heading, clauses }: ClauseSectionProps) {
  return (
    <section className="stack" style={{ gap: 'var(--space-3)' }}>
      <h4 className="t-h4">{heading}</h4>
      <ul
        className="stack"
        style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}
      >
        {clauses.map((clause) => (
          <li key={clause} className="t-body">
            {clause}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CareContractView() {
  const { t } = useI18n();

  return (
    <Card wide className="stack" style={{ gap: 'var(--space-6)' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('contract.title')}</h3>
        <p className="t-body t-muted">{t('contract.intro')}</p>
      </div>

      <ClauseSection
        heading={t('contract.recipientHeading')}
        clauses={RECIPIENT_CLAUSE_KEYS.map((key) => t(key))}
      />
      <ClauseSection
        heading={t('contract.caretakerHeading')}
        clauses={CARETAKER_CLAUSE_KEYS.map((key) => t(key))}
      />
      <ClauseSection
        heading={t('contract.breachHeading')}
        clauses={BREACH_CLAUSE_KEYS.map((key) => t(key))}
      />

      <p className="t-caption t-muted">{t('contract.footer')}</p>
    </Card>
  );
}
