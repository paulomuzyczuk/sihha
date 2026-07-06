'use client';

import React from 'react';

interface NotesTextareaProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

export default function NotesTextarea({
  value,
  onChange,
  disabled,
}: NotesTextareaProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= 1000) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">Observações ({value.length}/1000)</label>
      <textarea
        value={value}
        onChange={handleChange}
        className="form-input"
        placeholder="Registre tendências comportamentais, hábitos de sono ou métricas psiquiátricas adicionais..."
        style={{ minHeight: '120px', resize: 'vertical' }}
        disabled={disabled}
      />
    </div>
  );
}
