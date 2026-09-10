'use client';

import React from 'react';
import { Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';
import type {
  CareContract,
  CareContractSection,
} from '../lib/careContract/types';

// The read-only view of the care agreement ("contrato de convivência", M6). It
// writes nothing — it exists so the recipient and the team can revisit, in one
// place, what is expected of them and what is owed in return.
//
// Every party sees the VERSION HISTORY, not just the text in force: they signed
// a specific document on a specific date, and "what did we agree to in May" is
// a fair question for anyone bound by it. Selecting a past version renders that
// version's own text, marked as no longer current.
//
// Renders whatever sections the data holds, in order, with no hardcoded
// headings — the same rule the crisis plan follows, and what lets a deployment
// write its own agreement.

interface SectionGroup {
  groupTitle: string | null;
  sections: CareContractSection[];
}

export function groupSections(sections: CareContractSection[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if (section.groupTitle && last && last.groupTitle === section.groupTitle) {
      last.sections.push(section);
      continue;
    }
    groups.push({ groupTitle: section.groupTitle, sections: [section] });
  }
  return groups;
}

function ClauseList({ clauses }: { clauses: Array<{ text: string }> }) {
  return (
    <ul
      className="stack"
      style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}
    >
      {clauses.map((clause, i) => (
        <li key={`${clause.text}-${i}`} className="t-body">
          {clause.text}
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ group }: { group: SectionGroup }) {
  if (!group.groupTitle) {
    const [section] = group.sections;
    return (
      <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
        <h4 className="t-h4">{section.title}</h4>
        <ClauseList clauses={section.clauses} />
      </Card>
    );
  }
  return (
    <Card wide className="stack" style={{ gap: 'var(--space-4)' }}>
      <h4 className="t-h4">{group.groupTitle}</h4>
      {group.sections.map((section) => (
        <section
          key={section.title}
          className="stack"
          style={{ gap: 'var(--space-2)' }}
        >
          <h5 className="t-overline">{section.title}</h5>
          <ClauseList clauses={section.clauses} />
        </section>
      ))}
    </Card>
  );
}

interface CareContractViewProps {
  contract: CareContract | null;
  /** Null while the caller has not picked one; the view shows the one in force. */
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
}

export default function CareContractView({
  contract,
  selectedVersionId,
  onSelectVersion,
}: CareContractViewProps) {
  const { locale, t } = useI18n();

  if (contract === null) {
    return (
      <div className="stack" style={{ gap: 'var(--space-2)', width: '100%' }}>
        <h3 className="t-h3">{t('contract.title')}</h3>
        <p className="t-body t-muted">{t('contract.loading')}</p>
      </div>
    );
  }

  const { version, versions } = contract;
  const groups = version ? groupSections(version.sections) : [];
  // The first group carries the recipient's own (longer) commitments; the rest
  // stack beside it on a wide screen. A presentation rule, not a data one.
  const [lead, ...rest] = groups;

  const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(
      locale === 'pt' ? 'pt-BR' : 'en-GB',
    );

  return (
    <div className="stack" style={{ gap: 'var(--space-6)', width: '100%' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('contract.title')}</h3>
        <p className="t-body t-muted">
          {t('contract.intro')}{' '}
          {version?.monthlyAllowance &&
            t('contract.reward', { amount: version.monthlyAllowance })}
        </p>
      </div>

      {versions.length > 1 && (
        <label style={{ display: 'block', maxWidth: '420px' }}>
          <span className="form-label">{t('contract.versionLabel')}</span>
          <select
            className="form-input"
            value={selectedVersionId ?? version?.id ?? ''}
            onChange={(e) => onSelectVersion(e.target.value)}
          >
            {versions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {t('contract.versionOption', {
                  number: String(entry.versionNumber),
                  date: formatDate(entry.agreedOn),
                })}
                {entry.isCurrent ? ` — ${t('contract.versionCurrent')}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {version && !version.isCurrent && (
        // Reading a superseded agreement without knowing it is superseded is
        // the one way a version picker can mislead.
        <p className="t-body">{t('contract.versionSuperseded')}</p>
      )}

      {!version && <p className="t-body t-muted">{t('contract.empty')}</p>}

      {version && (
        <div className="contract-grid">
          {lead && <SectionCard group={lead} />}
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            {rest.map((group) => (
              <SectionCard
                key={group.groupTitle ?? group.sections[0].title}
                group={group}
              />
            ))}
          </div>
        </div>
      )}

      {version && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <p className="t-caption t-muted">{t('contract.reviewNote')}</p>
          <p className="t-caption t-muted">
            {version.witnesses.length > 0 && (
              <>
                {t('contract.witnessesLabel')}: {version.witnesses.join(', ')}
                {' · '}
              </>
            )}
            {t('contract.agreedOn', { date: formatDate(version.agreedOn) })}
          </p>
        </div>
      )}
    </div>
  );
}
