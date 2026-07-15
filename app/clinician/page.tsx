'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import ClinicianPanel from '../../components/ClinicianPanel';
import CircleSwitcher from '../../components/CircleSwitcher';
import LanguageToggle from '../../components/LanguageToggle';
import AppNavbar from '../../components/AppNavbar';
import { Button } from '../../components/ui';
import { API_ROUTES, CARE_ROLES, ROLES } from '../../lib/constants';
import { useI18n } from '../../lib/i18n/I18nProvider';
import {
  CareCircle,
  loadSelectedRecipientId,
  persistSelectedRecipientId,
  resolveSelectedCircle,
} from '../../lib/circles';

export default function ClinicianPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!session) {
          router.push('/login');
          return;
        }
        if (session.user.app_metadata?.role === ROLES.ADMIN) {
          router.push('/admin');
          return;
        }
        // Membership-based gating (M3/M4): this dashboard shows the circle
        // the user selected, and only when they are its clinician.
        const res = await fetch(API_ROUTES.CIRCLES, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const fetched: CareCircle[] = res.ok
          ? ((await res.json()).circles ?? [])
          : [];
        const selected = resolveSelectedCircle(
          fetched,
          loadSelectedRecipientId(),
        );
        if (!selected || selected.role !== CARE_ROLES.CLINICIAN) {
          router.push('/dashboard');
          return;
        }
        setCircles(fetched);
        setSelectedId(selected.recipientId);
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

  const handleSwitchCircle = (recipientId: string) => {
    persistSelectedRecipientId(recipientId);
    const next = circles.find((c) => c.recipientId === recipientId);
    // Selected a circle where the user is not the clinician → its home view
    if (next && next.role !== CARE_ROLES.CLINICIAN) {
      router.push('/dashboard');
      return;
    }
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
        {selectedId && (
          <CircleSwitcher
            circles={circles}
            selectedId={selectedId}
            onChange={handleSwitchCircle}
          />
        )}
        <span className="user-badge clinician">{t('clinician.badge')}</span>
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
        }}
      >
        {selectedId && (
          <ClinicianPanel
            key={selectedId}
            accessToken={accessToken}
            recipientId={selectedId}
            clinicalProfile={
              circles.find((c) => c.recipientId === selectedId)
                ?.clinicalProfile ?? null
            }
          />
        )}
      </main>
    </div>
  );
}
