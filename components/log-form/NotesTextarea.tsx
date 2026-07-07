'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n/I18nProvider';

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
  const { t } = useI18n();
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= 1000) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">
        {t('notes.label', { count: value.length })}
      </label>
      <textarea
        value={value}
        onChange={handleChange}
        className="form-input"
        placeholder={t('notes.placeholder')}
        style={{ minHeight: '120px', resize: 'vertical' }}
        disabled={disabled}
      />
    </div>
  );
}
