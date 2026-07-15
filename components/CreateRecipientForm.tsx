'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { useI18n } from '../lib/i18n/I18nProvider';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  kind: string;
  logCadence: string;
  metricCount: number;
}

interface UserOption {
  id: string;
  email: string;
}

// The circles all live in one of these three places — a curated list beats
// scrolling the full IANA registry.
const TIMEZONES: readonly string[] = [
  'America/Campo_Grande',
  'America/Sao_Paulo',
  'Europe/Berlin',
];

interface CreateRecipientFormProps {
  accessToken: string;
}

/**
 * Admin flow to create a care circle from a template (M4): pick a care
 * profile, name the recipient, set the timezone and assign the circle's
 * owner — the API instantiates the recipient, its metric definitions, alert
 * config and the owner membership (every circle has an explicitly assigned
 * owner). Further members are invited afterwards via the invite view.
 */
export default function CreateRecipientForm({
  accessToken,
}: CreateRecipientFormProps) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONES.includes(resolved) ? resolved : TIMEZONES[0];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [templatesRes, usersRes] = await Promise.all([
          fetch(API_ROUTES.ADMIN_RECIPIENTS, { headers }),
          fetch(API_ROUTES.ADMIN_USERS, { headers }),
        ]);
        if (!templatesRes.ok || !usersRes.ok) {
          setError(t('recipient.loadTemplatesFailed'));
          return;
        }
        const fetched: TemplateOption[] =
          (await templatesRes.json()).templates ?? [];
        setTemplates(fetched);
        if (fetched.length > 0) setTemplateId(fetched[0].id);
        setUsers((await usersRes.json()).users ?? []);
      } catch {
        setError(t('recipient.connErrorTemplates'));
      }
    };
    loadOptions();
  }, [accessToken, t]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(API_ROUTES.ADMIN_RECIPIENTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          template_id: templateId,
          display_name: displayName.trim(),
          timezone,
          owner_user_id: ownerId,
        }),
      });

      if (!res.ok) {
        setError(
          res.status === 400
            ? t('recipient.invalidData')
            : t('recipient.createFailed'),
        );
        return;
      }

      const data = await res.json();
      setMessage(
        t('recipient.created', {
          name: data.recipient.displayName,
          count: data.metricCount,
        }),
      );
      setDisplayName('');
    } catch {
      setError(t('recipient.connErrorCreate'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        {t('recipient.title')}
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
          <label className="form-label">{t('recipient.template')}</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="form-input"
            disabled={loading || templates.length === 0}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          {selectedTemplate && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginTop: '0.5rem',
              }}
            >
              {selectedTemplate.description}{' '}
              {t('recipient.metricsSuffix', {
                count: selectedTemplate.metricCount,
              })}
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t('recipient.name')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="form-input"
            placeholder={t('recipient.namePlaceholder')}
            disabled={loading}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t('recipient.timezone')}</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="form-input"
            disabled={loading}
            required
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="form-label">{t('recipient.owner')}</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="form-input"
            disabled={loading || users.length === 0}
            required
          >
            <option value="" disabled>
              {t('recipient.ownerPlaceholder')}
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading || !templateId || !ownerId}
        >
          {loading ? t('recipient.submitting') : t('recipient.submit')}
        </button>
      </form>
    </div>
  );
}
