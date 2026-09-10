'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { API_ROUTES, ROLES } from '../../lib/constants';
import type { InstitutionSummary } from '../../services/institutionAuth';
import InstitutionSwitcher from '../../components/InstitutionSwitcher';
import LanguageToggle from '../../components/LanguageToggle';
import AppNavbar from '../../components/AppNavbar';
import AdminConsole from '../../components/admin/AdminConsole';
import { Button } from '../../components/ui';
import { useI18n } from '../../lib/i18n/I18nProvider';

// Admin console entry: gate on the platform ADMIN tier, load the admin's
// institutions (for the switcher — a no-op render for the common
// single-institution case), and hand off to AdminConsole, the tabbed
// per-circle + per-institution console.
export default function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [institutions, setInstitutions] = useState<InstitutionSummary[]>([]);
  const [activeInstitutionId, setActiveInstitutionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          router.push('/login');
          return;
        }
        if (session.user.app_metadata?.role !== ROLES.ADMIN) {
          router.push('/dashboard');
          return;
        }
        setAccessToken(session.access_token);
        fetch(API_ROUTES.ADMIN_INSTITUTIONS, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : { institutions: [] }))
          .then((d) => {
            const list: InstitutionSummary[] = d.institutions ?? [];
            setInstitutions(list);
            if (list.length > 0) setActiveInstitutionId(list[0].id);
          })
          .catch(() => {});
        setLoading(false);
      })
      .catch(() => router.push('/login'));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

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

  const activeInstitution = institutions.find(
    (i) => i.id === activeInstitutionId,
  );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <AppNavbar>
        <span className="user-badge admin">{t('admin.badge')}</span>
        <InstitutionSwitcher
          institutions={institutions}
          activeId={activeInstitutionId}
          onChange={setActiveInstitutionId}
        />
        <LanguageToggle />
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard')}
        >
          {t('common.dashboard')}
        </Button>
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
        }}
      >
        <AdminConsole
          accessToken={accessToken}
          institutionId={activeInstitutionId}
          institution={activeInstitution}
        />
      </main>
    </div>
  );
}
