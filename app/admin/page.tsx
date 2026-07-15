'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { API_ROUTES, CARE_ROLES, ROLES } from '../../lib/constants';
import { withViewAs } from '../../lib/circles';
import { MedicationOption } from '../../lib/types';
import LogForm from '../../components/LogForm';
import PatientPanel from '../../components/PatientPanel';
import ClinicianPanel from '../../components/ClinicianPanel';
import InviteUserForm from '../../components/InviteUserForm';
import CreateRecipientForm from '../../components/CreateRecipientForm';
import MetricEditor from '../../components/MetricEditor';
import LanguageToggle from '../../components/LanguageToggle';
import AppNavbar from '../../components/AppNavbar';
import { Button } from '../../components/ui';
import { useI18n } from '../../lib/i18n/I18nProvider';
import type { TranslationKey } from '../../lib/i18n/dictionaries';

type AdminView =
  | 'THERAPIST'
  | 'PATIENT'
  | 'PSYCHOLOGIST'
  | 'PSYCHIATRIST'
  | 'INVITE'
  | 'RECIPIENT'
  | 'METRICS'
  | null;

const VIEW_LABEL_KEYS: Record<NonNullable<AdminView>, TranslationKey> = {
  THERAPIST: 'admin.viewTherapist',
  PATIENT: 'admin.viewPatient',
  PSYCHOLOGIST: 'admin.viewPsychologist',
  PSYCHIATRIST: 'admin.viewPsychiatrist',
  INVITE: 'admin.invite',
  RECIPIENT: 'admin.newCircle',
  METRICS: 'admin.editMetrics',
};

export default function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<AdminView>(null);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          router.push('/login');
          return;
        }
        const role = session.user.app_metadata?.role;
        if (role !== ROLES.ADMIN) {
          router.push('/dashboard');
          return;
        }
        setAccessToken(session.access_token);
        setLoading(false);
      })
      .catch(() => router.push('/login'));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleSelectView = async (view: AdminView) => {
    setSelectedView(view);
    if (view === 'THERAPIST' && medications.length === 0 && accessToken) {
      // view_as: the medications route is caregiver/owner-scoped, and the
      // preview must see exactly what the therapist sees (one tri-state
      // per med, not the empty-list fallback)
      const res = await fetch(
        withViewAs(API_ROUTES.MEDICATIONS, CARE_ROLES.CAREGIVER),
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setMedications(data.medications ?? []);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div
        className="flex-center"
        style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}
      >
        <div
          className="spinner"
          style={{ width: '32px', height: '32px', borderWidth: '3px' }}
        ></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {t('common.checkingSession')}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <AppNavbar>
        <span className="user-badge admin">{t('admin.badge')}</span>
        <LanguageToggle />
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          {t('common.signOut')}
        </Button>
      </AppNavbar>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'var(--space-8) var(--space-6)',
          gap: 'var(--space-8)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {(
            [
              'THERAPIST',
              'PATIENT',
              'PSYCHOLOGIST',
              'PSYCHIATRIST',
              'INVITE',
              'RECIPIENT',
              'METRICS',
            ] as const
          ).map((view) => (
            <Button
              key={view}
              variant={selectedView === view ? 'primary' : 'outline'}
              onClick={() =>
                handleSelectView(selectedView === view ? null : view)
              }
            >
              {t(VIEW_LABEL_KEYS[view])}
            </Button>
          ))}
        </div>

        {/* Previews carry the matching view_as so they work regardless of the
            admin's own membership role (authorizeCareRequest, admins only). */}
        {selectedView === 'THERAPIST' && (
          <LogForm medications={medications} viewAs={CARE_ROLES.CAREGIVER} />
        )}

        {selectedView === 'PATIENT' && (
          <PatientPanel viewAs={CARE_ROLES.RECIPIENT} />
        )}

        {(selectedView === 'PSYCHOLOGIST' ||
          selectedView === 'PSYCHIATRIST') && (
          <ClinicianPanel
            key={selectedView}
            accessToken={accessToken}
            viewAs={CARE_ROLES.CLINICIAN}
            viewProfile={selectedView.toLowerCase()}
            clinicalProfile={selectedView.toLowerCase()}
          />
        )}

        {selectedView === 'INVITE' && (
          <InviteUserForm accessToken={accessToken} />
        )}

        {selectedView === 'RECIPIENT' && (
          <CreateRecipientForm accessToken={accessToken} />
        )}

        {selectedView === 'METRICS' && (
          <MetricEditor accessToken={accessToken} />
        )}
      </main>
    </div>
  );
}
