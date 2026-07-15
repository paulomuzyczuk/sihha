'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import AppNavbar from '../../components/AppNavbar';
import LogForm from '../../components/LogForm';
import InvoiceUploadForm from '../../components/InvoiceUploadForm';
import PatientPanel from '../../components/PatientPanel';
import CircleSwitcher from '../../components/CircleSwitcher';
import ClinicianPanel from '../../components/ClinicianPanel';
import MetricEditor from '../../components/MetricEditor';
import LanguageToggle from '../../components/LanguageToggle';
import RoleViewSwitcher from '../../components/RoleViewSwitcher';
import { Alert, Button, Card } from '../../components/ui';
import {
  API_ROUTES,
  CARE_ROLES,
  CareRoleValue,
  ROLES,
} from '../../lib/constants';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { DATE_LOCALES } from '../../lib/i18n/dictionaries';
import {
  CareCircle,
  loadSelectedRecipientId,
  persistSelectedRecipientId,
  resolveSelectedCircle,
  withRecipient,
  withViewAs,
} from '../../lib/circles';
import { MedicationOption } from '../../lib/types';

export default function DashboardPage() {
  const { locale, t } = useI18n();
  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Platform-admin role preview (null = the stored membership role); a
  // clinician preview additionally carries the specialist profile
  const [viewRole, setViewRole] = useState<CareRoleValue | null>(null);
  const [viewRoleProfile, setViewRoleProfile] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        // Platform admins stay on the dashboard when they belong to a circle:
        // it is where the role-view switcher lives. Admins without any
        // membership have nothing to preview and go to the admin panel.
        const admin = session.user.app_metadata?.role === ROLES.ADMIN;
        setIsAdmin(admin);

        // Membership-based gating (M3/M4): the user's circles decide which
        // view this page shows. Multi-circle users get a switcher; the role
        // that matters is the one held in the SELECTED circle.
        const res = await fetch(API_ROUTES.CIRCLES, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const fetched: CareCircle[] = res.ok
          ? ((await res.json()).circles ?? [])
          : [];

        if (fetched.length === 0) {
          if (admin) {
            router.push('/admin');
            return;
          }
          setPending(true);
          setLoading(false);
        } else {
          const selected = resolveSelectedCircle(
            fetched,
            loadSelectedRecipientId(),
          )!;
          setCircles(fetched);
          setSelectedId(selected.recipientId);
        }
        setAccessToken(session.access_token);

        // Mask email slightly for visual privacy
        const rawEmail = session.user.email || '';
        const [local, domain] = rawEmail.split('@');
        if (local && domain) {
          const maskedLocal =
            local.length > 3 ? `${local.slice(0, 3)}...` : local;
          setEmail(`${maskedLocal}@${domain}`);
        } else {
          setEmail(rawEmail);
        }
      } catch (_e) {
        router.push('/login');
      }
    };

    checkUser();

    // Listen for auth changes to prevent session hijacking
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const selectedCircle =
    circles.find((circle) => circle.recipientId === selectedId) ?? null;
  const actualRole = pending ? 'PENDING' : selectedCircle?.role;
  // The admin's preview role wins over the stored membership role; every
  // membership-scoped API call then carries ?view_as so the server applies
  // the same substitution (authorizeCareRequest — admins only).
  const role = isAdmin && viewRole ? viewRole : actualRole;
  const viewAs = isAdmin && viewRole ? viewRole : null;
  const viewProfile = viewAs === CARE_ROLES.CLINICIAN ? viewRoleProfile : null;

  // Everything below the navbar is scoped to the selected circle: clinicians
  // go to their dashboard, caregivers get that circle's medication checklist.
  // Admins never leave this page — a clinician preview renders inline.
  useEffect(() => {
    if (!selectedCircle || !accessToken) return;
    if (selectedCircle.role === CARE_ROLES.CLINICIAN && !isAdmin) {
      router.push('/clinician');
      return;
    }
    const loadMedications = async () => {
      if (role === CARE_ROLES.CAREGIVER) {
        const medsRes = await fetch(
          withViewAs(
            withRecipient(API_ROUTES.MEDICATIONS, selectedCircle.recipientId),
            viewAs,
          ),
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        setMedications(
          medsRes.ok ? ((await medsRes.json()).medications ?? []) : [],
        );
      }
      setLoading(false);
    };
    loadMedications();
  }, [selectedCircle, accessToken, router, isAdmin, role, viewAs]);

  const handleSwitchCircle = (recipientId: string) => {
    persistSelectedRecipientId(recipientId);
    setLoading(true);
    setViewRole(null);
    setViewRoleProfile(null);
    setSelectedId(recipientId);
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
        <p className="t-sm t-muted">{t('common.checkingSession')}</p>
      </div>
    );
  }

  // "Tuesday · June 10" — the quiet date overline above the check-in
  const today = new Date().toLocaleDateString(DATE_LOCALES[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <AppNavbar>
        <span>{email}</span>
        {selectedId && (
          <CircleSwitcher
            circles={circles}
            selectedId={selectedId}
            onChange={handleSwitchCircle}
          />
        )}
        {isAdmin && selectedCircle && (
          <RoleViewSwitcher
            actualRole={selectedCircle.role as CareRoleValue}
            actualProfile={selectedCircle.clinicalProfile ?? null}
            valueRole={(role ?? selectedCircle.role) as CareRoleValue}
            valueProfile={viewProfile ?? selectedCircle.clinicalProfile ?? null}
            onChange={(nextRole, nextProfile) => {
              setViewRole(nextRole);
              setViewRoleProfile(nextProfile);
            }}
          />
        )}
        {role === CARE_ROLES.CAREGIVER && (
          <span className="user-badge therapist">
            {t('dashboard.caregiverBadge')}
          </span>
        )}
        {role === CARE_ROLES.RECIPIENT && (
          <span className="user-badge patient">
            {t('dashboard.patientBadge')}
          </span>
        )}
        {role === CARE_ROLES.CLINICIAN && (
          <span className="user-badge clinician">{t('clinician.badge')}</span>
        )}
        <LanguageToggle />
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          {t('common.signOut')}
        </Button>
      </AppNavbar>

      <main className="app-main">
        {role === 'PENDING' || !selectedCircle ? (
          <div className="flex-center">
            <Card style={{ textAlign: 'center' }}>
              <h2 style={{ marginBottom: 'var(--space-4)' }}>
                {t('dashboard.pendingTitle')}
              </h2>
              <Alert
                variant="info"
                style={{ textAlign: 'left', marginBottom: 'var(--space-5)' }}
              >
                {t('dashboard.pendingBody')}
              </Alert>
              <Button variant="outline" onClick={handleSignOut}>
                {t('dashboard.backToAccess')}
              </Button>
            </Card>
          </div>
        ) : role === CARE_ROLES.CAREGIVER ? (
          <div
            className="stack"
            style={{ gap: 'var(--space-5)', maxWidth: 720, margin: '0 auto' }}
          >
            <div>
              <div className="t-overline" style={{ marginBottom: 6 }}>
                {today}
              </div>
              <h2>
                {t('dashboard.howToday', {
                  name: selectedCircle.displayName,
                })}
              </h2>
            </div>
            {/* key: switching circles remounts the form with a clean state */}
            <LogForm
              key={selectedCircle.recipientId}
              medications={medications}
              recipientId={selectedCircle.recipientId}
              viewAs={viewAs}
            />
          </div>
        ) : role === CARE_ROLES.CLINICIAN ? (
          // Admin preview only — actual clinicians are routed to /clinician
          <ClinicianPanel
            key={`${selectedCircle.recipientId}:${viewProfile ?? ''}`}
            accessToken={accessToken}
            recipientId={selectedCircle.recipientId}
            viewAs={viewAs}
            viewProfile={viewProfile}
            clinicalProfile={viewProfile}
          />
        ) : role === CARE_ROLES.OWNER ? (
          <div
            key={selectedCircle.recipientId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-8)',
              width: '100%',
            }}
          >
            <MetricEditor
              accessToken={accessToken}
              recipientId={selectedCircle.recipientId}
            />
            <InvoiceUploadForm recipientId={selectedCircle.recipientId} />
          </div>
        ) : (
          <PatientPanel
            key={selectedCircle.recipientId}
            recipientId={selectedCircle.recipientId}
            viewAs={viewAs}
          />
        )}
      </main>
    </div>
  );
}
