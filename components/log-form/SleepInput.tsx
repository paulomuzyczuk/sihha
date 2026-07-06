'use client';

import React from 'react';

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
  const hours = computeHours(value.start, value.end);
  const overLimit = hours !== null && hours >= 14;

  return (
    <div className="form-group">
      <label className="form-label">Horários de Sono</label>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label
            className="form-label"
            style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}
          >
            Hora de Dormir
          </label>
          <input
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="form-input"
            disabled={disabled}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            className="form-label"
            style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}
          >
            Hora de Acordar
          </label>
          <input
            type="time"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="form-input"
            disabled={disabled}
          />
        </div>
      </div>
      {hours !== null && (
        <p
          style={{
            fontSize: '0.85rem',
            marginTop: '0.5rem',
            color: overLimit
              ? 'hsl(var(--error, 0 84% 60%))'
              : 'hsl(var(--text-secondary))',
          }}
        >
          {overLimit
            ? `${hours.toFixed(1)}h — verifique os horários (14+ horas é improvável)`
            : `${hours.toFixed(1)} horas de sono`}
        </p>
      )}
    </div>
  );
}
