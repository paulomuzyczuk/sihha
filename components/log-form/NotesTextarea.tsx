'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { Field, Textarea } from '../ui';

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
    <Field
      label={t('notes.label', { count: value.length })}
      htmlFor="log-notes"
      hint={t('notes.hint')}
      className="form-group"
    >
      <Textarea
        id="log-notes"
        value={value}
        onChange={handleChange}
        placeholder={t('notes.placeholder')}
        style={{ minHeight: '120px' }}
        disabled={disabled}
      />
    </Field>
  );
}
