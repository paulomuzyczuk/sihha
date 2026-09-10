'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES, CARE_ROLES } from '../../lib/constants';
import { withRecipient, withViewAs } from '../../lib/circles';
import type { MedicationOption } from '../../lib/types';
import LogForm from '../LogForm';
import PatientPanel from '../PatientPanel';
import ClinicianPanel from '../ClinicianPanel';
import MetricEditor from '../MetricEditor';
import InviteUserForm from '../InviteUserForm';
import CreateRecipientForm from '../CreateRecipientForm';
import AdminAlertRules from './AdminAlertRules';
import AdminSupplyCounting from './AdminSupplyCounting';
import { Button } from '../ui';
import { useI18n } from '../../lib/i18n/I18nProvider';
import {
  type Tab,
  CIRCLE_TABS,
  PLATFORM_TABS,
  TAB_LABEL_KEYS,
} from './adminTabs';

interface CircleSummary {
  id: string;
  displayName: string;
}

interface AdminConsoleProps {
  accessToken: string;
}

/**
 * The admin console body: pick one of the deployment's circles, then work
 * across per-circle views/tabs (log/patient/clinician previews, metrics,
 * alert rules, supply counting) plus platform-wide tabs (invite, new
 * circle). A single self-hosted deployment has one platform ADMIN tier and
 * no tenant boundary, so circles are listed platform-wide.
 */
export default function AdminConsole({ accessToken }: AdminConsoleProps) {
  const { t } = useI18n();
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<Tab>('invite');
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(API_ROUTES.ADMIN_CIRCLES, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const fetched: CircleSummary[] = d.circles ?? [];
        setCircles(fetched);
        if (fetched.length > 0) setSelectedId((id) => id || fetched[0].id);
      })
      .catch(() => setError(t('adminConsole.loadCirclesFailed')));
  }, [accessToken, t]);

  useEffect(() => {
    if (tab !== 'companion' || !selectedId) return;
    // The companion LogForm needs the SELECTED circle's medication
    // checklist; fetch it through the caregiver view of that circle.
    const url = withViewAs(
      withRecipient(API_ROUTES.MEDICATIONS, selectedId),
      CARE_ROLES.CAREGIVER,
    );
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMedications(d.medications ?? []))
      .catch(() => setMedications([]));
  }, [tab, selectedId, accessToken]);

  const needsCircle = CIRCLE_TABS.includes(tab);
  const circleMissing = needsCircle && !selectedId;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '960px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
    >
      {error && <div className="alert alert-error">{error}</div>}

      <CircleSelector
        circles={circles}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <TabGroup label={t('adminConsole.groupCircle')}>
        {CIRCLE_TABS.map((value) => (
          <TabButton key={value} value={value} active={tab} onSelect={setTab} />
        ))}
      </TabGroup>
      <TabGroup label={t('adminConsole.groupPlatform')}>
        {PLATFORM_TABS.map((value) => (
          <TabButton key={value} value={value} active={tab} onSelect={setTab} />
        ))}
      </TabGroup>

      <div style={{ marginTop: 'var(--space-4)' }}>
        {circleMissing ? (
          <p style={{ color: 'var(--text-muted)' }}>
            {t('adminConsole.selectCirclePrompt')}
          </p>
        ) : (
          <TabContent
            tab={tab}
            accessToken={accessToken}
            recipientId={selectedId}
            circleCount={circles.length}
            medications={medications}
          />
        )}
      </div>
    </div>
  );
}

function CircleSelector({
  circles,
  selectedId,
  onSelect,
}: {
  circles: CircleSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  if (circles.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)' }}>
        {t('adminConsole.noCircles')}
      </p>
    );
  }
  return (
    <label style={{ display: 'block', maxWidth: '420px' }}>
      <span className="form-label">{t('adminConsole.selectCircle')}</span>
      <select
        className="form-input"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {circles.map((circle) => (
          <option key={circle.id} value={circle.id}>
            {circle.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function TabGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="form-label"
        style={{
          marginBottom: 'var(--space-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {children}
      </div>
    </div>
  );
}

function TabButton({
  value,
  active,
  onSelect,
}: {
  value: Tab;
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      variant={active === value ? 'primary' : 'outline'}
      onClick={() => onSelect(value)}
    >
      {t(TAB_LABEL_KEYS[value])}
    </Button>
  );
}

function TabContent({
  tab,
  accessToken,
  recipientId,
  circleCount,
  medications,
}: {
  tab: Tab;
  accessToken: string;
  recipientId: string;
  circleCount: number;
  medications: MedicationOption[];
}) {
  switch (tab) {
    case 'companion':
      return (
        <LogForm
          medications={medications}
          viewAs={CARE_ROLES.CAREGIVER}
          recipientId={recipientId}
        />
      );
    case 'patient':
      return (
        <PatientPanel viewAs={CARE_ROLES.RECIPIENT} recipientId={recipientId} />
      );
    case 'psychologist':
    case 'psychiatrist':
      return (
        <ClinicianPanel
          key={tab}
          accessToken={accessToken}
          recipientId={recipientId}
          viewAs={CARE_ROLES.CLINICIAN}
          viewProfile={tab}
          clinicalProfile={tab}
        />
      );
    case 'metrics':
      return (
        <MetricEditor accessToken={accessToken} recipientId={recipientId} />
      );
    case 'alerts':
      return (
        <AdminAlertRules accessToken={accessToken} recipientId={recipientId} />
      );
    case 'counting':
      return (
        <AdminSupplyCounting
          accessToken={accessToken}
          recipientId={recipientId}
        />
      );
    case 'invite':
      // A single-circle deployment doesn't need to say which one — the API
      // resolves it on its own; several circles require it explicitly.
      return (
        <InviteUserForm
          accessToken={accessToken}
          recipientId={circleCount > 1 ? recipientId : undefined}
        />
      );
    case 'recipient':
      return <CreateRecipientForm accessToken={accessToken} />;
  }
}
