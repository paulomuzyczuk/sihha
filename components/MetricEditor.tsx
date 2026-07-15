'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import { DATE_LOCALES } from '../lib/i18n/dictionaries';
import { Dialog } from './ui';

// Owner-facing CRUD over the circle's metric definitions (M4, design §5.4).
// The server enforces decision #4 (value_type freezes once referenced), so
// this editor never offers a type change — retiring and re-creating under a
// new key is the sanctioned path, and both actions live here.

interface MetricRow {
  key: string;
  label: string;
  value_type: string;
  config: Record<string, unknown>;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  cadence_day: number | null;
  cadence_days: number[] | null;
  cadence_start: string | null;
  section: string | null;
  filled_by: string;
  clinician_profile: string | null;
  required: boolean;
  sort_order: number;
  active: boolean;
}

// Who fills the metric (owner is API-supported but not offered here) and,
// for clinician metrics, the optional specialist scope.
const FILLED_BY_OPTIONS = ['caregiver', 'clinician', 'recipient'] as const;
type FilledBy = (typeof FILLED_BY_OPTIONS)[number];
const CLINICIAN_PROFILES = ['psychologist', 'psychiatrist'] as const;
type ClinicianProfileOption = (typeof CLINICIAN_PROFILES)[number] | '';

const VALUE_TYPES = [
  'scale',
  'boolean',
  'number',
  'duration_minutes',
  'time_range',
  'enum',
  'medication_checklist',
  'text',
] as const;
type ValueType = (typeof VALUE_TYPES)[number];

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
type Weekday = (typeof WEEKDAYS)[number];

// Daily needs no configuration; everything else goes through the custom
// popup (Google-Calendar style: a repeat rule anchored to a start date).
type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
type CustomCadence = Exclude<Cadence, 'daily'>;
const CUSTOM_CADENCES: readonly CustomCadence[] = [
  'weekly',
  'monthly',
  'quarterly',
];

const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const weekdayMon0Of = (iso: string) =>
  (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;

interface MetricEditorProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

export default function MetricEditor({
  accessToken,
  recipientId,
}: MetricEditorProps) {
  const { locale, t } = useI18n();
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('boolean');
  const [newCadence, setNewCadence] = useState<Cadence>('daily');
  const [newCadenceStart, setNewCadenceStart] = useState(todayIso);
  const [newCadenceDays, setNewCadenceDays] = useState<number[]>([]);
  const [newSection, setNewSection] = useState('');
  const [newFilledBy, setNewFilledBy] = useState<FilledBy>('caregiver');
  const [newClinicianProfile, setNewClinicianProfile] =
    useState<ClinicianProfileOption>('');
  const [newRequired, setNewRequired] = useState(false);
  const [newConfig, setNewConfig] = useState('');

  // Custom-recurrence popup: edits a draft, applied only on "Done"
  const [customOpen, setCustomOpen] = useState(false);
  const [draftCadence, setDraftCadence] = useState<CustomCadence>('weekly');
  const [draftStart, setDraftStart] = useState(todayIso);
  const [draftDays, setDraftDays] = useState<number[]>([]);

  const openCustomDialog = () => {
    setDraftCadence(newCadence === 'daily' ? 'weekly' : newCadence);
    setDraftStart(newCadenceStart);
    setDraftDays(
      newCadenceDays.length > 0
        ? newCadenceDays
        : [weekdayMon0Of(newCadenceStart)],
    );
    setCustomOpen(true);
  };

  const applyCustomDialog = () => {
    setNewCadence(draftCadence);
    setNewCadenceStart(draftStart);
    setNewCadenceDays(
      draftCadence === 'weekly' ? [...draftDays].sort((a, b) => a - b) : [],
    );
    setCustomOpen(false);
  };

  const toggleDraftDay = (day: number) =>
    setDraftDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    );

  const formatLocalDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(DATE_LOCALES[locale], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

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
          ...(newCadence !== 'daily' ? { cadence_start: newCadenceStart } : {}),
          ...(newCadence === 'weekly' && newCadenceDays.length > 0
            ? { cadence_days: newCadenceDays }
            : {}),
          ...(newSection.trim() ? { section: newSection.trim() } : {}),
          filled_by: newFilledBy,
          ...(newFilledBy === 'clinician' && newClinicianProfile
            ? { clinician_profile: newClinicianProfile }
            : {}),
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
      setNewCadence('daily');
      setNewCadenceStart(todayIso());
      setNewCadenceDays([]);
      setNewSection('');
      setNewFilledBy('caregiver');
      setNewClinicianProfile('');
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

  // Row summary next to the type: "Semanal · Terça", "Mensal · a partir de
  // 15/07/2026" — daily stays quiet.
  const cadenceSummary = (metric: MetricRow): string => {
    if (metric.cadence === 'daily') return '';
    const parts: string[] = [];
    if (metric.cadence === 'weekly') {
      parts.push(t('metric.cadenceWeekly'));
      if (metric.cadence_days && metric.cadence_days.length > 0) {
        parts.push(
          metric.cadence_days.map((day) => weekdayLabel(day)).join(', '),
        );
      } else if (metric.cadence_day !== null) {
        parts.push(weekdayLabel(metric.cadence_day));
      }
    } else {
      parts.push(
        metric.cadence === 'monthly'
          ? t('metric.cadenceMonthly')
          : t('metric.cadenceQuarterly'),
      );
      if (metric.cadence_start) {
        parts.push(
          t('metric.fromDate', { date: formatLocalDate(metric.cadence_start) }),
        );
      }
    }
    return ` · ${parts.join(' · ')}`;
  };

  // Who fills it, shown only off the caregiver default: "Clínico · Psiquiatra"
  const fillerSummary = (metric: MetricRow): string => {
    if (metric.filled_by === 'caregiver') return '';
    const parts: string[] = [];
    if ((FILLED_BY_OPTIONS as readonly string[]).includes(metric.filled_by)) {
      parts.push(t(`metric.filledBy.${metric.filled_by as FilledBy}`));
    } else {
      parts.push(metric.filled_by);
    }
    if (
      metric.filled_by === 'clinician' &&
      metric.clinician_profile &&
      (CLINICIAN_PROFILES as readonly string[]).includes(
        metric.clinician_profile,
      )
    ) {
      parts.push(
        t(
          `metric.clinicianProfile.${
            metric.clinician_profile as (typeof CLINICIAN_PROFILES)[number]
          }`,
        ),
      );
    }
    return ` · ${parts.join(' · ')}`;
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--border-soft)',
    flexWrap: 'wrap',
  };

  const smallBtn: React.CSSProperties = { width: 'auto' };

  return (
    <div className="card" style={{ maxWidth: '720px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        {t('metric.title')}
      </h2>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
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
                  className="btn btn-outline btn-sm"
                  style={smallBtn}
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label={t('metric.moveUp', { label: metric.label })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
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
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {valueTypeLabel(metric.value_type)}
                {cadenceSummary(metric)}
                {fillerSummary(metric)}
              </span>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
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
                className="btn btn-outline btn-sm"
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
                color: 'var(--text-muted)',
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
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">{t('metric.section')}</label>
            <input
              type="text"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              className="form-input"
              placeholder={t('metric.sectionPlaceholder')}
              disabled={busy}
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
              value={newCadence === 'daily' ? 'daily' : 'custom'}
              onChange={(e) => {
                if (e.target.value === 'daily') {
                  setNewCadence('daily');
                } else {
                  openCustomDialog();
                }
              }}
              className="form-input"
              disabled={busy}
            >
              <option value="daily">{t('metric.cadenceDaily')}</option>
              <option value="custom">{t('metric.cadenceCustom')}</option>
            </select>
            {newCadence !== 'daily' && (
              <button
                type="button"
                className="btn-link"
                style={{ alignSelf: 'flex-start' }}
                onClick={openCustomDialog}
              >
                {newCadence === 'weekly'
                  ? `${t('metric.cadenceWeekly')}${
                      newCadenceDays.length > 0
                        ? ` · ${newCadenceDays
                            .map((day) => weekdayLabel(day))
                            .join(', ')}`
                        : ''
                    }`
                  : newCadence === 'monthly'
                    ? t('metric.cadenceMonthly')
                    : t('metric.cadenceQuarterly')}{' '}
                ·{' '}
                {t('metric.fromDate', {
                  date: formatLocalDate(newCadenceStart),
                })}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">{t('metric.filledByLabel')}</label>
            <select
              value={newFilledBy}
              onChange={(e) => {
                const filledBy = e.target.value as FilledBy;
                setNewFilledBy(filledBy);
                if (filledBy !== 'clinician') setNewClinicianProfile('');
              }}
              className="form-input"
              disabled={busy}
            >
              {FILLED_BY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`metric.filledBy.${value}`)}
                </option>
              ))}
            </select>
          </div>
          {newFilledBy === 'clinician' && (
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label className="form-label">
                {t('metric.clinicianProfileLabel')}
              </label>
              <select
                value={newClinicianProfile}
                onChange={(e) =>
                  setNewClinicianProfile(
                    e.target.value as ClinicianProfileOption,
                  )
                }
                className="form-input"
                disabled={busy}
              >
                <option value="">{t('metric.clinicianProfile.any')}</option>
                {CLINICIAN_PROFILES.map((value) => (
                  <option key={value} value={value}>
                    {t(`metric.clinicianProfile.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <Dialog
          open={customOpen}
          title={t('metric.customTitle')}
          onClose={() => setCustomOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCustomOpen(false)}
              >
                {t('metric.customCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyCustomDialog}
                disabled={draftCadence === 'weekly' && draftDays.length === 0}
              >
                {t('metric.customDone')}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">{t('metric.customRepeats')}</label>
            <select
              value={draftCadence}
              onChange={(e) => setDraftCadence(e.target.value as CustomCadence)}
              className="form-input"
            >
              {CUSTOM_CADENCES.map((cadence) => (
                <option key={cadence} value={cadence}>
                  {cadence === 'weekly'
                    ? t('metric.cadenceWeekly')
                    : cadence === 'monthly'
                      ? t('metric.cadenceMonthly')
                      : t('metric.cadenceQuarterly')}
                </option>
              ))}
            </select>
          </div>
          {draftCadence === 'weekly' && (
            <div className="form-group">
              <span className="form-label">{t('metric.repeatOn')}</span>
              <div className="pill-group">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className="pill"
                    aria-pressed={draftDays.includes(day)}
                    onClick={() => toggleDraftDay(day)}
                    style={{ minHeight: 34, padding: '0 12px' }}
                  >
                    {weekdayLabel(day).slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('metric.customStart')}</label>
            <input
              type="date"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              className="form-input"
            />
          </div>
        </Dialog>

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

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy}
        >
          {busy ? t('metric.saving') : t('metric.create')}
        </button>
      </form>
    </div>
  );
}
