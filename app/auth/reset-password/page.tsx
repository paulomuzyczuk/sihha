'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../components/supabaseClient';
import { clientLogger } from '../../../services/clientLogger';
import {
  INITIAL_STATE,
  applyAuthEvent,
  getTimeoutNextState,
  validatePasswordUpdate,
} from './logic';
import type { ResetState } from './logic';

const TIMEOUT_MS = 5000;

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'hsl(var(--text-secondary))',
  cursor: 'pointer',
  textDecoration: 'underline',
  fontSize: '0.85rem',
};

export default function ResetPasswordPage() {
  const [resetState, setResetState] = useState<ResetState>(INITIAL_STATE);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setResetState((current) => {
        const next = getTimeoutNextState(current);
        if (next === 'invalid') {
          clientLogger.warn('invalid or expired recovery token', {
            service: 'auth',
            route: '/auth/reset-password',
          });
        }
        return next;
      });
    }, TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      clearTimeout(timeout);
      setResetState((current) => {
        const next = applyAuthEvent(current, event);
        if (next === 'invalid') {
          clientLogger.warn('invalid or expired recovery token', {
            service: 'auth',
            route: '/auth/reset-password',
          });
        }
        return next;
      });
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setSubmitError('');

    const err = validatePasswordUpdate(password, confirm);
    if (err) {
      setValidationError(err);
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      clientLogger.error(
        'password reset failed',
        { service: 'auth', route: '/auth/reset-password' },
        updateError,
      );
      setSubmitError('Não foi possível redefinir a senha. Tente novamente.');
      setSubmitting(false);
      return;
    }

    clientLogger.info('password reset successful', {
      service: 'auth',
      route: '/auth/reset-password',
    });
    setResetState('success');
    await supabase.auth.signOut();
    setTimeout(() => router.push('/auth'), 2000);
  };

  if (resetState === 'loading') {
    return (
      <main
        className="flex-center"
        style={{ minHeight: '100vh', padding: '1.5rem' }}
      >
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: 'hsl(var(--text-secondary))' }}>Verificando...</p>
        </div>
      </main>
    );
  }

  if (resetState === 'invalid') {
    return (
      <main
        className="flex-center"
        style={{ minHeight: '100vh', padding: '1.5rem' }}
      >
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>
              Link inválido ou expirado. Solicite um novo link de redefinição de
              senha.
            </span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => router.push('/auth')}
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  if (resetState === 'success') {
    return (
      <main
        className="flex-center"
        style={{ minHeight: '100vh', padding: '1.5rem' }}
      >
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            <span>Senha redefinida com sucesso.</span>
          </div>
          <p
            style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}
          >
            Redirecionando para o login...
          </p>
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
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
          Redefinir Senha
        </h1>

        {submitError && (
          <div className="alert alert-error">
            <span>{submitError}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <div className="form-group">
            <label className="form-label">Nova senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label className="form-label">Confirmar nova senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          {validationError && (
            <p
              style={{
                color: 'hsl(var(--error))',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {validationError}
            </p>
          )}

          <button
            type="submit"
            className="btn"
            disabled={submitting}
            style={{ marginTop: '1rem' }}
          >
            {submitting ? 'Redefinindo...' : 'Redefinir senha'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => router.push('/auth')}
            style={linkStyle}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </main>
  );
}
