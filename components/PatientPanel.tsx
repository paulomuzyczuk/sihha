'use client';

import React, { useState } from 'react';
import CareContractView from './CareContractView';
import GoalsDashboard from './GoalsDashboard';
import InvoiceUploadForm from './InvoiceUploadForm';
import LogForm from './LogForm';
import LongTermGoalsView from './LongTermGoalsView';
import { Button, Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';

// The patient's home (M6): a small menu picks which interface shows —
// the monthly behavioural goals, the long-term life goals, the self-report
// questionnaires, invoice upload, or the read-only care agreement.

type PatientView =
  | 'goals'
  | 'longterm'
  | 'questionnaires'
  | 'invoices'
  | 'contract';

const VIEWS: PatientView[] = [
  'goals',
  'longterm',
  'questionnaires',
  'invoices',
  'contract',
];

interface PatientPanelProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
}

export default function PatientPanel({
  recipientId,
  viewAs,
}: PatientPanelProps) {
  const { t } = useI18n();
  const [view, setView] = useState<PatientView>('goals');

  const labels: Record<PatientView, string> = {
    goals: t('patient.menuGoals'),
    longterm: t('patient.menuLongTerm'),
    questionnaires: t('patient.menuQuestionnaires'),
    invoices: t('patient.menuInvoices'),
    contract: t('patient.menuContract'),
  };

  return (
    <div
      className="stack"
      style={{ gap: 'var(--space-6)', alignItems: 'center', width: '100%' }}
    >
      <div
        className="row"
        role="tablist"
        style={{
          gap: 'var(--space-2)',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {VIEWS.map((option) => (
          <Button
            key={option}
            role="tab"
            aria-selected={view === option}
            variant={view === option ? 'primary' : 'outline'}
            onClick={() => setView(option)}
          >
            {labels[option]}
          </Button>
        ))}
      </div>

      {view === 'goals' && (
        <GoalsDashboard recipientId={recipientId} viewAs={viewAs} />
      )}
      {view === 'longterm' && <LongTermGoalsView />}
      {view === 'questionnaires' && (
        <LogForm
          medications={[]}
          recipientId={recipientId}
          viewAs={viewAs}
          role="recipient"
          emptyFallback={
            <Card style={{ textAlign: 'center' }}>
              <p className="t-sm t-muted">{t('patient.noQuestionnaires')}</p>
            </Card>
          }
        />
      )}
      {view === 'invoices' && (
        <InvoiceUploadForm recipientId={recipientId} viewAs={viewAs} />
      )}
      {view === 'contract' && <CareContractView />}
    </div>
  );
}
