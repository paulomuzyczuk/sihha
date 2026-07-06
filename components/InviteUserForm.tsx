'use client';

import React, { useState } from 'react';
import { API_ROUTES } from '../lib/constants';

type InviteProfile = 'therapist' | 'psychologist' | 'psychiatrist' | 'patient';

// The admin thinks in professions; the API thinks in care-circle roles (M3).
// This single mapping bridges the two: the profession becomes the member
// label, the care role decides authorization.
const PROFILE_OPTIONS: Array<{
  value: InviteProfile;
  label: string;
  careRole: 'caregiver' | 'clinician' | 'recipient';
}> = [
  { value: 'therapist', label: 'Terapeuta', careRole: 'caregiver' },
  { value: 'psychologist', label: 'Psicóloga', careRole: 'clinician' },
  { value: 'psychiatrist', label: 'Psiquiatra', careRole: 'clinician' },
  { value: 'patient', label: 'Paciente', careRole: 'recipient' },
];

interface InviteUserFormProps {
  accessToken: string;
}

/**
 * Admin-initiated onboarding: sends a Supabase invite e-mail with the account
 * fully provisioned (access tier + clinical profile), replacing the retired
 * public sign-up + approval flow.
 */
export default function InviteUserForm({ accessToken }: InviteUserFormProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [profile, setProfile] = useState<InviteProfile>('therapist');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(API_ROUTES.ADMIN_INVITE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          role: PROFILE_OPTIONS.find((opt) => opt.value === profile)!.careRole,
          member_label:
            profile === 'patient'
              ? undefined
              : PROFILE_OPTIONS.find((opt) => opt.value === profile)!.label,
        }),
      });

      if (res.status === 409) {
        setError('Este e-mail já possui uma conta.');
        return;
      }
      if (!res.ok) {
        setError('Não foi possível enviar o convite. Tente novamente.');
        return;
      }

      setMessage(`Convite enviado para ${email.trim()}.`);
      setEmail('');
      setFullName('');
    } catch {
      setError('Erro de conexão ao enviar o convite.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Convidar Usuário
      </h2>

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

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="form-group">
          <label className="form-label">Nome completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="form-input"
            placeholder="Nome Sobrenome"
            disabled={loading}
            required
          />
        </div>

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

        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="form-label">Perfil</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as InviteProfile)}
            className="form-input"
            disabled={loading}
          >
            {PROFILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Enviando convite...' : 'Enviar convite'}
        </button>
      </form>
    </div>
  );
}
