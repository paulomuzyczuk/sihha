'use client';

import React from 'react';
import { Select } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { InstitutionSummary } from '../services/institutionAuth';

interface InstitutionSwitcherProps {
  institutions: InstitutionSummary[];
  activeId: string | null;
  onChange: (id: string) => void;
}

/**
 * Institution picker for the navbar: renders nothing for an admin who runs
 * exactly one institution (the common case) — only an admin of SEVERAL
 * institutions needs to say which one they're acting as.
 */
export default function InstitutionSwitcher({
  institutions,
  activeId,
  onChange,
}: InstitutionSwitcherProps) {
  const { t } = useI18n();

  if (institutions.length <= 1) return null;

  return (
    <Select
      aria-label={t('institutionSwitcher.aria')}
      value={activeId ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {institutions.map((institution) => (
        <option key={institution.id} value={institution.id}>
          {institution.name}
        </option>
      ))}
    </Select>
  );
}
