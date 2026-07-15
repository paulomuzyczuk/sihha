'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { Input } from '../ui';

interface SleepInputProps {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
  disabled: boolean;
}

function computeHours(start: string, end: string): number | null {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return null;
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

export default function SleepInput({
  value,
  onChange,
  disabled,
}: SleepInputProps) {
  const { t } = useI18n();
  const hours = computeHours(value.start, value.end);
  const overLimit = hours !== null && hours >= 14;

  return (
    <div className="form-group">
      <span className="field-label">{t('sleep.title')}</span>
      <div className="row" style={{ gap: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>
          <label
            className="field-hint"
            style={{ display: 'block', marginBottom: 'var(--space-1)' }}
          >
            {t('sleep.bedtime')}
          </label>
          <Input
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            disabled={disabled}
          />
          <span
            className="field-hint"
            style={{ display: 'block', marginTop: 'var(--space-1)' }}
          >
            {t('sleep.bedtimeHint')}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <label
            className="field-hint"
            style={{ display: 'block', marginBottom: 'var(--space-1)' }}
          >
            {t('sleep.wakeTime')}
          </label>
          <Input
            type="time"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            disabled={disabled}
          />
          <span
            className="field-hint"
            style={{ display: 'block', marginTop: 'var(--space-1)' }}
          >
            {t('sleep.wakeHint')}
          </span>
        </div>
      </div>
      {hours !== null && (
        <p
          className="t-sm"
          style={{
            color: overLimit ? 'var(--danger-ink)' : 'var(--text-muted)',
          }}
        >
          {overLimit
            ? t('sleep.overLimit', { hours: hours.toFixed(1) })
            : t('sleep.hours', { hours: hours.toFixed(1) })}
        </p>
      )}
    </div>
  );
}
