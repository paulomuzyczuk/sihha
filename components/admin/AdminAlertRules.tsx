'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../../lib/constants';
import { useI18n } from '../../lib/i18n/I18nProvider';

interface AlertRule {
  id: string;
  metric_key: string;
  comparator: 'gte' | 'lte' | 'eq';
  threshold: number;
  label: string;
  active: boolean;
}

interface AdminAlertRulesProps {
  accessToken: string;
  recipientId: string;
}

/**
 * Admin console: per-circle metric alert rules. Recipients are not pickable
 * here — a rule with none configured falls back to the circle's flagged
 * alert members + the instance admin (services/alertRules.ts), which is the
 * same fallback the fixed low-stock alert already uses. A circle-wide member
 * picker needs an admin-scoped circle-membership read that doesn't exist
 * yet, so it's left out of this first version rather than half-built.
 */
export default function AdminAlertRules({
  accessToken,
  recipientId,
}: AdminAlertRulesProps) {
  const { t } = useI18n();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [metricKey, setMetricKey] = useState('');
  const [comparator, setComparator] = useState<AlertRule['comparator']>('lte');
  const [threshold, setThreshold] = useState('');
  const [label, setLabel] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const loadRules = async () => {
    try {
      const res = await fetch(
        `${API_ROUTES.ADMIN_ALERT_RULES}?recipient_id=${encodeURIComponent(recipientId)}`,
        { headers: authHeaders },
      );
      if (!res.ok) {
        setError(t('adminAlertRules.loadFailed'));
        return;
      }
      setRules((await res.json()).rules ?? []);
    } catch {
      setError(t('adminAlertRules.loadFailed'));
    }
  };

  useEffect(() => {
    if (recipientId) loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(API_ROUTES.ADMIN_ALERT_RULES, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          recipient_id: recipientId,
          metric_key: metricKey.trim(),
          comparator,
          threshold: Number(threshold),
          label: label.trim(),
        }),
      });

      if (!res.ok) {
        setError(t('adminAlertRules.createFailed'));
        return;
      }

      setMessage(t('adminAlertRules.created', { label: label.trim() }));
      setMetricKey('');
      setThreshold('');
      setLabel('');
      await loadRules();
    } catch {
      setError(t('adminAlertRules.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (rule: AlertRule) => {
    setError('');
    try {
      const res = await fetch(`${API_ROUTES.ADMIN_ALERT_RULES}/${rule.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!res.ok) {
        setError(t('adminAlertRules.updateFailed'));
        return;
      }
      await loadRules();
    } catch {
      setError(t('adminAlertRules.updateFailed'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
          {t('adminAlertRules.title')}
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
            <label className="form-label">{t('adminAlertRules.metric')}</label>
            <input
              type="text"
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              className="form-input"
              placeholder="mood_score"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('adminAlertRules.comparator')}
            </label>
            <select
              value={comparator}
              onChange={(e) =>
                setComparator(e.target.value as AlertRule['comparator'])
              }
              className="form-input"
              disabled={loading}
            >
              <option value="gte">{t('adminAlertRules.comparatorGte')}</option>
              <option value="lte">{t('adminAlertRules.comparatorLte')}</option>
              <option value="eq">{t('adminAlertRules.comparatorEq')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('adminAlertRules.threshold')}
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="form-input"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label">{t('adminAlertRules.label')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="form-input"
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={
              loading || !metricKey.trim() || !label.trim() || !threshold
            }
          >
            {loading
              ? t('adminAlertRules.submitting')
              : t('adminAlertRules.submit')}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rules.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            {t('adminAlertRules.empty')}
          </p>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '480px',
            }}
          >
            <span>
              {rule.label} — {rule.metric_key} {rule.comparator}{' '}
              {rule.threshold}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => toggleActive(rule)}
            >
              {rule.active
                ? t('adminAlertRules.deactivate')
                : t('adminAlertRules.activate')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
