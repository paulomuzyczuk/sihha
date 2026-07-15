'use client';

import React, { useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { TranslationKey } from '../lib/i18n/dictionaries';

type InviteProfile = 'therapist' | 'psychologist' | 'psychiatrist' | 'patient';

// The admin thinks in professions; the API thinks in care-circle roles (M3).
// This single mapping bridges the two: the profession becomes the member
// label (in the admin's active UI language), the care role decides
// authorization.
const PROFILE_OPTIONS: Array<{
  value: InviteProfile;
  labelKey: TranslationKey;
  careRole: 'caregiver' | 'clinician' | 'recipient';
}> = [
  {
    value: 'therapist',
    labelKey: 'invite.profile.therapist',
    careRole: 'caregiver',
  },
  {
    value: 'psychologist',
    labelKey: 'invite.profile.psychologist',
    careRole: 'clinician',
  },
  {
    value: 'psychiatrist',
    labelKey: 'invite.profile.psychiatrist',
    careRole: 'clinician',
  },
  {
    value: 'patient',
    labelKey: 'invite.profile.patient',
    careRole: 'recipient',
  },
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
  const { t } = useI18n();
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
              : t(
                  PROFILE_OPTIONS.find((opt) => opt.value === profile)!
                    .labelKey,
                ),
          clinical_profile: profile === 'patient' ? undefined : profile,
        }),
      });

      if (res.status === 409) {
        setError(t('invite.emailExists'));
        return;
      }
      if (!res.ok) {
        setError(t('invite.failed'));
        return;
      }

      setMessage(t('invite.sent', { email: email.trim() }));
      setEmail('');
      setFullName('');
    } catch {
      setError(t('invite.connError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        {t('invite.title')}
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
          <label className="form-label">{t('invite.fullName')}</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="form-input"
            placeholder={t('invite.fullNamePlaceholder')}
            disabled={loading}
            required
          />
        </div>

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

        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="form-label">{t('invite.profileLabel')}</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as InviteProfile)}
            className="form-input"
            disabled={loading}
          >
            {PROFILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading}
        >
          {loading ? t('invite.submitting') : t('invite.submit')}
        </button>
      </form>
    </div>
  );
}
