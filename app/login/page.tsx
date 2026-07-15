'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import LanguageToggle from '../../components/LanguageToggle';
import {
  Alert,
  Button,
  Field,
  Icon,
  Input,
  SihhaMark,
} from '../../components/ui';
import { ROLES } from '../../lib/constants';
import { loadCachedHomeRoute, persistHomeRoute } from '../../lib/homeRoute';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { homeRouteForMemberships } from './logic';

// Membership lookup for post-login routing (M3). RLS lets a user read only
// their own care_team_members rows.
async function resolveHomeRoute(appMetadataRole: string | undefined) {
  const isPlatformAdmin = appMetadataRole === ROLES.ADMIN;
  const { data } = await supabase.from('care_team_members').select('role');
  return homeRouteForMemberships(
    isPlatformAdmin,
    (data ?? []).map((m) => m.role as string),
  );
}

// Single authentication gateway. There is intentionally NO sign-up here:
// accounts are provisioned by the admin via invite e-mail (/api/admin/invite),
// and public sign-ups are disabled at the Supabase project level.

type AuthState = 'login' | 'forgot-password';

/** Warm moss brand panel — the left half of the sign-in screen. */
function BrandAside() {
  const { t } = useI18n();
  return (
    <div className="login-aside">
      <div className="aside-brand">
        <SihhaMark size={34} />
        <b>sihha</b>
        <span className="ar">صِحّة</span>
      </div>
      <div className="aside-hero">
        <h1>{t('login.heroTitle')}</h1>
        <p>{t('login.heroBody')}</p>
      </div>
      <div className="aside-foot">
        <Icon name="shield" size={18} />
        {t('login.privacyFoot')}
      </div>
      <div className="leaf-bg">
        <Icon name="leaf" size={420} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  const [authState, setAuthState] = useState<AuthState>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Gates the form until we know the visitor is NOT already signed in, so a
  // returning user never sees (and starts filling) the login form while the
  // redirect to their home route is still resolving.
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) setChecking(false);
        return;
      }
      // Known user: skip the membership round-trip and redirect immediately.
      // The destination page re-validates membership, so a stale cache entry
      // only costs one extra client-side redirect.
      const cached = loadCachedHomeRoute(session.user.id);
      if (cached) {
        router.replace(cached);
        return;
      }
      const route = await resolveHomeRoute(session.user.app_metadata?.role);
      if (cancelled) return;
      if (route) {
        persistHomeRoute(session.user.id, route);
        router.replace(route);
      } else {
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const switchState = (next: AuthState) => {
    setError('');
    setMessage('');
    setAuthState(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.session) {
      setError(t('login.invalidCredentials'));
      setLoading(false);
      return;
    }

    // Authorization = membership in a care circle (M3). An account without
    // one is not yet provisioned — lock it out until the admin adds it.
    const route = await resolveHomeRoute(data.session.user.app_metadata?.role);
    if (!route) {
      setError(t('login.noCircle'));
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    persistHomeRoute(data.session.user.id, route);
    router.push(route);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${siteUrl}/auth/reset-password` },
    );

    if (resetError) {
      setError(t('login.resetFailed'));
      setLoading(false);
      return;
    }

    setMessage(t('login.resetSent'));
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="login">
        <BrandAside />
        <main className="login-form-side">
          <div
            className="flex-center"
            style={{ flexDirection: 'column', gap: '1rem' }}
          >
            <div
              className="spinner"
              style={{ width: '32px', height: '32px', borderWidth: '3px' }}
            ></div>
            <p className="t-sm t-muted">{t('common.checkingSession')}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="login">
      <BrandAside />

      <main className="login-form-side">
        <div className="login-form-card">
          {authState === 'forgot-password' ? (
            <>
              <h2>{t('login.resetTitle')}</h2>
              <p className="sub">{t('login.resetSubtitle')}</p>

              {error && <Alert variant="danger">{error}</Alert>}
              {message && <Alert variant="success">{message}</Alert>}

              {!message && (
                <form onSubmit={handleForgotPassword}>
                  <Field label={t('login.email')} htmlFor="email-input">
                    <Input
                      id="email-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('login.emailPlaceholder')}
                      disabled={loading}
                      required
                    />
                  </Field>
                  <Button
                    type="submit"
                    block
                    disabled={loading}
                    style={{ marginTop: 'var(--space-6)' }}
                  >
                    {loading ? t('login.sending') : t('login.sendResetLink')}
                  </Button>
                </form>
              )}

              <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => switchState('login')}
                >
                  {t('common.backToLogin')}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: 'var(--space-8)' }}>
                {t('login.title')}
              </h2>

              {error && <Alert variant="danger">{error}</Alert>}

              <form onSubmit={handleLogin}>
                <Field label={t('login.email')} htmlFor="email-input">
                  <Input
                    id="email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    disabled={loading}
                    required
                  />
                </Field>
                <Field
                  label={t('login.password')}
                  htmlFor="password-input"
                  labelEnd={
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => switchState('forgot-password')}
                    >
                      {t('login.forgot')}
                    </button>
                  }
                >
                  <Input
                    id="password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.passwordPlaceholder')}
                    disabled={loading}
                    required
                  />
                </Field>

                <Button
                  type="submit"
                  block
                  disabled={loading}
                  style={{ marginTop: 'var(--space-6)' }}
                >
                  {loading ? t('login.submitting') : t('login.submit')}
                </Button>
              </form>

              <p
                className="t-caption"
                style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}
              >
                {t('login.inviteOnly')}
              </p>
            </>
          )}

          <div className="flex-center" style={{ marginTop: 'var(--space-6)' }}>
            <LanguageToggle />
          </div>
        </div>
      </main>
    </div>
  );
}
