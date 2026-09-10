'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../../lib/constants';
import { withInstitution } from '../../lib/circles';
import { useI18n } from '../../lib/i18n/I18nProvider';

interface AdminInstitutionPanelProps {
  accessToken: string;
  institutionId: string | null;
  currentName: string;
}

/** Admin console tab: rename the caller's own institution. */
export default function AdminInstitutionPanel({
  accessToken,
  institutionId,
  currentName,
}: AdminInstitutionPanelProps) {
  const { t } = useI18n();
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setName(currentName), [currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(
        withInstitution(API_ROUTES.ADMIN_INSTITUTIONS, institutionId),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      if (!res.ok) {
        setError(t('adminInstitution.renameFailed'));
        return;
      }
      setMessage(t('adminInstitution.renamed'));
    } catch {
      setError(t('adminInstitution.renameFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        {t('adminInstitution.title')}
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
        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="form-label">{t('adminInstitution.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-input"
            maxLength={200}
            disabled={loading}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading || !name.trim()}
        >
          {loading
            ? t('adminInstitution.submitting')
            : t('adminInstitution.submit')}
        </button>
      </form>
    </div>
  );
}
