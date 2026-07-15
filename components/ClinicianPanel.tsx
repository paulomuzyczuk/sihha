'use client';

import React, { useState } from 'react';
import ClinicianDashboard from './ClinicianDashboard';
import GoalsDashboard from './GoalsDashboard';
import LogForm from './LogForm';
import PrescriptionUploadForm from './PrescriptionUploadForm';
import EvaluationUploadForm from './EvaluationUploadForm';
import { Button, Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';

// The clinical team's home (M8), modeled on PatientPanel: a small menu picks
// between the specialist's scales, the prescription upload (psychiatrist
// only), the evaluation-document upload (psychologist only), the patient's
// goal progress and the read-only indicators both profiles share.

type ClinicianView =
  | 'scales'
  | 'prescriptions'
  | 'evaluations'
  | 'goals'
  | 'indicators';

interface ClinicianPanelProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
  // Specialist refinement of a clinician preview (?view_profile)
  viewProfile?: string | null;
  // The member's clinical profile (or the previewed one) — decides the tabs
  clinicalProfile: string | null;
}

export default function ClinicianPanel({
  accessToken,
  recipientId,
  viewAs,
  viewProfile,
  clinicalProfile,
}: ClinicianPanelProps) {
  const { t } = useI18n();
  const [view, setView] = useState<ClinicianView>('scales');

  const views: ClinicianView[] = [
    'scales',
    ...(clinicalProfile === 'psychiatrist'
      ? (['prescriptions'] as ClinicianView[])
      : []),
    ...(clinicalProfile === 'psychologist'
      ? (['evaluations'] as ClinicianView[])
      : []),
    'goals',
    'indicators',
  ];

  const labels: Record<ClinicianView, string> = {
    // The psychologist gives feedback per session; the psychiatrist per
    // appointment — same flow, profile-specific wording.
    scales:
      clinicalProfile === 'psychiatrist'
        ? t('clinician.menuScalesPsychiatrist')
        : t('clinician.menuScales'),
    prescriptions: t('clinician.menuPrescriptions'),
    evaluations: t('clinician.menuEvaluations'),
    goals: t('clinician.menuGoals'),
    indicators: t('clinician.menuIndicators'),
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
        {views.map((option) => (
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

      {view === 'scales' && (
        <LogForm
          medications={[]}
          recipientId={recipientId}
          viewAs={viewAs}
          viewProfile={viewProfile}
          role="clinician"
          withNotes={false}
          emptyFallback={
            <Card style={{ textAlign: 'center' }}>
              <p className="t-sm t-muted">{t('clinician.noScales')}</p>
            </Card>
          }
        />
      )}
      {view === 'prescriptions' && clinicalProfile === 'psychiatrist' && (
        <PrescriptionUploadForm
          recipientId={recipientId}
          viewAs={viewAs}
          viewProfile={viewProfile}
        />
      )}
      {view === 'evaluations' && clinicalProfile === 'psychologist' && (
        <EvaluationUploadForm
          recipientId={recipientId}
          viewAs={viewAs}
          viewProfile={viewProfile}
        />
      )}
      {view === 'goals' && (
        <GoalsDashboard recipientId={recipientId} viewAs={viewAs} />
      )}
      {view === 'indicators' && (
        <ClinicianDashboard
          accessToken={accessToken}
          recipientId={recipientId}
          viewAs={viewAs}
        />
      )}
    </div>
  );
}
