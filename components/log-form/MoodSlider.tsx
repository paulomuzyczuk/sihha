'use client';

import React from 'react';

interface MoodSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}

export default function MoodSlider({
  value,
  onChange,
  disabled,
}: MoodSliderProps) {
  return (
    <div className="mood-slider-container">
      <label className="form-label">Pontuação de Humor do Paciente (1-5)</label>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="mood-slider"
        disabled={disabled}
      />
      <div className="mood-labels">
        <span>1 (Muito Ruim)</span>
        <span>3 (Estável)</span>
        <span>5 (Excelente)</span>
      </div>
    </div>
  );
}
