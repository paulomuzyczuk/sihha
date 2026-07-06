'use client';

import React from 'react';
import { AppointmentEntry } from '../../lib/types';
import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPES,
} from '../../lib/constants';

interface AppointmentSectionProps {
  value: AppointmentEntry | null;
  onChange: (value: AppointmentEntry | null) => void;
  disabled: boolean;
}

const DEFAULT_APPOINTMENT: AppointmentEntry = {
  type: APPOINTMENT_TYPES.PSYCHOLOGIST,
  attended: true,
};

export default function AppointmentSection({
  value,
  onChange,
  disabled,
}: AppointmentSectionProps) {
  const active = value !== null;

  return (
    <div className="form-group">
      <div className="switch-container">
        <span className="form-label" style={{ margin: 0 }}>
          Consulta Hoje
        </span>
        <label className="switch">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) =>
              onChange(e.target.checked ? DEFAULT_APPOINTMENT : null)
            }
            disabled={disabled}
          />
          <span className="slider"></span>
        </label>
      </div>
      {active && value && (
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <select
            value={value.type}
            onChange={(e) =>
              onChange({
                ...value,
                type: e.target.value as AppointmentEntry['type'],
              })
            }
            className="form-input"
            disabled={disabled}
          >
            {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <div className="switch-container" style={{ margin: 0 }}>
            <span className="form-label" style={{ margin: 0 }}>
              Compareceu
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={value.attended}
                onChange={(e) =>
                  onChange({ ...value, attended: e.target.checked })
                }
                disabled={disabled}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
