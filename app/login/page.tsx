'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import LanguageToggle from '../../components/LanguageToggle';
import { ROLES } from '../../lib/constants';
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

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'hsl(var(--text-secondary))',
  cursor: 'pointer',
  textDecoration: 'underline',
  fontSize: '0.85rem',
};

export default function LoginPage() {
  const { t } = useI18n();
  const [authState, setAuthState] = useState<AuthState>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const route = await resolveHomeRoute(session.user.app_metadata?.role);
        if (route) router.push(route);
      }
    });
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

  if (authState === 'forgot-password') {
    return (
      <main
        className="flex-center"
        style={{ minHeight: '100vh', padding: '1.5rem' }}
      >
        <div className="card">
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
            {t('login.resetTitle')}
          </h1>
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="alert alert-success">
              <span>{message}</span>
            </div>
          )}
          {!message && (
            <form
              onSubmit={handleForgotPassword}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div className="form-group">
                <label className="form-label">{t('login.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder={t('login.emailPlaceholder')}
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? t('login.sending') : t('login.sendResetLink')}
              </button>
            </form>
          )}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => switchState('login')}
              style={linkStyle}
            >
              {t('common.backToLogin')}
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '1rem',
            }}
          >
            <LanguageToggle />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex-center"
      style={{ minHeight: '100vh', padding: '1.5rem' }}
    >
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem' }}>{t('common.brand')}</h1>
          <p
            style={{
              color: 'hsl(var(--text-secondary))',
              fontSize: '0.9rem',
              marginTop: '0.25rem',
            }}
          >
            {t('login.subtitle')}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleLogin}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <div className="form-group">
            <label className="form-label">{t('login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder={t('login.emailPlaceholder')}
              disabled={loading}
              required
              id="email-input"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              disabled={loading}
              required
              id="password-input"
            />
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => switchState('forgot-password')}
              style={linkStyle}
            >
              {t('login.forgot')}
            </button>
          </div>
        </form>

        <p
          style={{
            color: 'hsl(var(--text-secondary))',
            fontSize: '0.8rem',
            textAlign: 'center',
            marginTop: '1.5rem',
          }}
        >
          {t('login.inviteOnly')}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '1rem',
          }}
        >
          <LanguageToggle />
        </div>
      </div>
    </main>
  );
}
