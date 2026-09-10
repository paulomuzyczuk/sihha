'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { ROLES } from '../../lib/constants';
import LanguageToggle from '../../components/LanguageToggle';
import AppNavbar from '../../components/AppNavbar';
import AdminConsole from '../../components/admin/AdminConsole';
import { Button } from '../../components/ui';
import { useI18n } from '../../lib/i18n/I18nProvider';

// Admin console entry: gate on the platform ADMIN tier, then hand off to
// AdminConsole, the tabbed per-circle console.
export default function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');

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

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <AppNavbar>
        <span className="user-badge admin">{t('admin.badge')}</span>
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
        <AdminConsole accessToken={accessToken} />
      </main>
    </div>
  );
}
