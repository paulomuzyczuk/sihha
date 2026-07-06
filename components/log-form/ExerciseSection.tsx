'use client';

import React from 'react';
import { ExerciseEntry } from '../../lib/types';
import {
  EXERCISE_DURATIONS,
  EXERCISE_TYPE_LABELS,
  EXERCISE_TYPES,
} from '../../lib/constants';

interface ExerciseSectionProps {
  value: ExerciseEntry | null;
  onChange: (value: ExerciseEntry | null) => void;
  disabled: boolean;
}

const DEFAULT_EXERCISE: ExerciseEntry = {
  type: EXERCISE_TYPES.WALKING,
  durationMinutes: 30,
};

export default function ExerciseSection({
  value,
  onChange,
  disabled,
}: ExerciseSectionProps) {
  const active = value !== null;

  return (
    <div className="form-group">
      <div className="switch-container">
        <span className="form-label" style={{ margin: 0 }}>
          Exercício Hoje
        </span>
        <label className="switch">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) =>
              onChange(e.target.checked ? DEFAULT_EXERCISE : null)
            }
            disabled={disabled}
          />
          <span className="slider"></span>
        </label>
      </div>
      {active && value && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem' }}>
          <select
            value={value.type}
            onChange={(e) =>
              onChange({
                ...value,
                type: e.target.value as ExerciseEntry['type'],
              })
            }
            className="form-input"
            disabled={disabled}
          >
            {Object.entries(EXERCISE_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={value.durationMinutes}
            onChange={(e) =>
              onChange({
                ...value,
                durationMinutes: parseInt(
                  e.target.value,
                ) as ExerciseEntry['durationMinutes'],
              })
            }
            className="form-input"
            disabled={disabled}
          >
            {EXERCISE_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
