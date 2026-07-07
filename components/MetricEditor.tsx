'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';

// Owner-facing CRUD over the circle's metric definitions (M4, design §5.4).
// The server enforces decision #4 (value_type freezes once referenced), so
// this editor never offers a type change — retiring and re-creating under a
// new key is the sanctioned path, and both actions live here.

interface MetricRow {
  key: string;
  label: string;
  value_type: string;
  config: Record<string, unknown>;
  cadence: 'daily' | 'weekly';
  cadence_day: number | null;
  filled_by: string;
  required: boolean;
  sort_order: number;
  active: boolean;
}

const VALUE_TYPES = [
  'scale',
  'boolean',
  'number',
  'duration_minutes',
  'time_range',
  'enum',
  'medication_checklist',
] as const;
type ValueType = (typeof VALUE_TYPES)[number];

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
type Weekday = (typeof WEEKDAYS)[number];

interface MetricEditorProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

export default function MetricEditor({
  accessToken,
  recipientId,
}: MetricEditorProps) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('boolean');
  const [newCadence, setNewCadence] = useState<'daily' | 'weekly'>('daily');
  const [newCadenceDay, setNewCadenceDay] = useState(0);
  const [newRequired, setNewRequired] = useState(false);
  const [newConfig, setNewConfig] = useState('');

  const routeFor = useCallback(
    (path: string) => (recipientId ? withRecipient(path, recipientId) : path),
    [recipientId],
  );

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const base = `${API_ROUTES.METRICS}?include_inactive=1`;
      const res = await fetch(
        recipientId ? withRecipient(base, recipientId) : base,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        setError(t('metric.loadFailed'));
        return;
      }
      const data = await res.json();
      const rows: MetricRow[] = data.metrics ?? [];
      setMetrics(rows);
      setLabels(Object.fromEntries(rows.map((row) => [row.key, row.label])));
    } catch {
      setError(t('metric.connErrorLoad'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, recipientId, t]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const patchMetric = async (
    key: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(routeFor(`${API_ROUTES.METRICS}/${key}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t('metric.saveFailed'));
        return false;
      }
      return true;
    } catch {
      setError(t('metric.connErrorSave'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLabel = async (metric: MetricRow) => {
    const label = (labels[metric.key] ?? '').trim();
    if (!label || label === metric.label) return;
    if (await patchMetric(metric.key, { label })) await loadMetrics();
  };

  const handleToggleRequired = async (metric: MetricRow) => {
    if (await patchMetric(metric.key, { required: !metric.required })) {
      await loadMetrics();
    }
  };

  const handleToggleActive = async (metric: MetricRow) => {
    if (await patchMetric(metric.key, { active: !metric.active })) {
      await loadMetrics();
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= metrics.length) return;
    const a = metrics[index];
    const b = metrics[target];
    // Swap the two sort_orders; the reload re-sorts the list
    if (
      (await patchMetric(a.key, { sort_order: b.sort_order })) &&
      (await patchMetric(b.key, { sort_order: a.sort_order }))
    ) {
      await loadMetrics();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    let config: Record<string, unknown> = {};
    if (newConfig.trim()) {
      try {
        config = JSON.parse(newConfig);
      } catch {
        setError(t('metric.invalidConfig'));
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(routeFor(API_ROUTES.METRICS), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          key: newKey.trim(),
          label: newLabel.trim(),
          value_type: newType,
          config,
          cadence: newCadence,
          ...(newCadence === 'weekly' ? { cadence_day: newCadenceDay } : {}),
          required: newRequired,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t('metric.createFailed'));
        return;
      }
      setMessage(t('metric.created', { label: newLabel.trim() }));
      setNewKey('');
      setNewLabel('');
      setNewConfig('');
      setNewRequired(false);
      await loadMetrics();
    } catch {
      setError(t('metric.connErrorCreate'));
    } finally {
      setBusy(false);
    }
  };

  const valueTypeLabel = (valueType: string): string =>
    (VALUE_TYPES as readonly string[]).includes(valueType)
      ? t(`metric.type.${valueType as ValueType}`)
      : valueType;

  const weekdayLabel = (day: number): string =>
    t(`metric.weekday.${(((day % 7) + 7) % 7) as Weekday}`);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
  };

  const smallBtn: React.CSSProperties = {
    width: 'auto',
    padding: '0.3rem 0.6rem',
    fontSize: '0.8rem',
  };

  return (
    <div className="card" style={{ maxWidth: '720px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        {t('metric.title')}
      </h2>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'hsl(var(--text-secondary))',
          marginBottom: '1.5rem',
        }}
      >
        {t('metric.typeFrozenNote')}
      </p>

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

      {loading ? (
        <div className="flex-center" style={{ padding: '2rem' }}>
          <div
            className="spinner"
            style={{ width: '28px', height: '28px', borderWidth: '3px' }}
          ></div>
        </div>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          {metrics.map((metric, index) => (
            <div key={metric.key} style={rowStyle}>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={smallBtn}
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label={t('metric.moveUp', { label: metric.label })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={smallBtn}
                  disabled={busy || index === metrics.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label={t('metric.moveDown', { label: metric.label })}
                >
                  ↓
                </button>
              </div>
              <input
                type="text"
                value={labels[metric.key] ?? metric.label}
                onChange={(e) =>
                  setLabels((cur) => ({
                    ...cur,
                    [metric.key]: e.target.value,
                  }))
                }
                onBlur={() => handleSaveLabel(metric)}
                className="form-input"
                style={{
                  flex: '1 1 200px',
                  padding: '0.4rem 0.6rem',
                  opacity: metric.active ? 1 : 0.5,
                }}
                disabled={busy}
                aria-label={t('metric.labelAria', { key: metric.key })}
              />
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'hsl(var(--text-secondary))',
                  whiteSpace: 'nowrap',
                }}
              >
                {valueTypeLabel(metric.value_type)}
                {metric.cadence === 'weekly' &&
                  metric.cadence_day !== null &&
                  ` · ${weekdayLabel(metric.cadence_day)}`}
              </span>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: 'hsl(var(--text-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={metric.required}
                  onChange={() => handleToggleRequired(metric)}
                  disabled={busy}
                />
                {t('metric.required')}
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                style={smallBtn}
                disabled={busy}
                onClick={() => handleToggleActive(metric)}
              >
                {metric.active ? t('metric.retire') : t('metric.reactivate')}
              </button>
            </div>
          ))}
          {metrics.length === 0 && (
            <p
              style={{
                color: 'hsl(var(--text-secondary))',
                textAlign: 'center',
                padding: '1rem 0',
              }}
            >
              {t('metric.empty')}
            </p>
          )}
        </div>
      )}

      <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>
        {t('metric.newTitle')}
      </h3>
      <form
        onSubmit={handleCreate}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">{t('metric.key')}</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="form-input"
              placeholder={t('metric.keyPlaceholder')}
              pattern="[a-z][a-z0-9_]*"
              disabled={busy}
              required
            />
          </div>
          <div className="form-group" style={{ flex: '2 1 220px' }}>
            <label className="form-label">{t('metric.label')}</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="form-input"
              placeholder={t('metric.labelPlaceholder')}
              disabled={busy}
              required
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">{t('metric.typeLabel')}</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="form-input"
              disabled={busy}
            >
              {VALUE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`metric.type.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">{t('metric.cadence')}</label>
            <select
              value={newCadence}
              onChange={(e) =>
                setNewCadence(e.target.value as 'daily' | 'weekly')
              }
              className="form-input"
              disabled={busy}
            >
              <option value="daily">{t('metric.cadenceDaily')}</option>
              <option value="weekly">{t('metric.cadenceWeekly')}</option>
            </select>
          </div>
          {newCadence === 'weekly' && (
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">{t('metric.weekdayLabel')}</label>
              <select
                value={newCadenceDay}
                onChange={(e) => setNewCadenceDay(Number(e.target.value))}
                className="form-input"
                disabled={busy}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {t(`metric.weekday.${day}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t('metric.configLabel')}</label>
          <textarea
            value={newConfig}
            onChange={(e) => setNewConfig(e.target.value)}
            className="form-input"
            rows={2}
            placeholder={t('metric.configPlaceholder')}
            disabled={busy}
          />
        </div>

        <label
          style={{
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <input
            type="checkbox"
            checked={newRequired}
            onChange={(e) => setNewRequired(e.target.checked)}
            disabled={busy}
          />
          {t('metric.requiredCheckbox')}
        </label>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('metric.saving') : t('metric.create')}
        </button>
      </form>
    </div>
  );
}
