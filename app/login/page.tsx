'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { ROLES } from '../../lib/constants';
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
      setError('Credenciais inválidas. Tente novamente.');
      setLoading(false);
      return;
    }

    // Authorization = membership in a care circle (M3). An account without
    // one is not yet provisioned — lock it out until the admin adds it.
    const route = await resolveHomeRoute(data.session.user.app_metadata?.role);
    if (!route) {
      setError('Sua conta ainda não está vinculada a um círculo de cuidado.');
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
      setError('Não foi possível enviar o e-mail de redefinição.');
      setLoading(false);
      return;
    }

    setMessage(
      'E-mail de redefinição enviado. Verifique sua caixa de entrada.',
    );
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
            Redefinir Senha
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
                <label className="form-label">Endereço de e-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="cuidador@dominio.com"
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>
            </form>
          )}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => switchState('login')}
              style={linkStyle}
            >
              Voltar ao login
            </button>
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
          <h1 style={{ fontSize: '2rem' }}>Sistema de Cuidados Integrado</h1>
          <p
            style={{
              color: 'hsl(var(--text-secondary))',
              fontSize: '0.9rem',
              marginTop: '0.25rem',
            }}
          >
            Plataforma de Cuidados — Acesso Seguro
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
            <label className="form-label">Endereço de e-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="cuidador@dominio.com"
              disabled={loading}
              required
              id="email-input"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label">Senha</label>
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
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => switchState('forgot-password')}
              style={linkStyle}
            >
              Esqueceu a senha?
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
          O acesso é por convite. Contate o administrador para receber o seu.
        </p>
      </div>
    </main>
  );
}
