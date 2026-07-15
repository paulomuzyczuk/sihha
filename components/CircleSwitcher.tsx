'use client';

import React from 'react';
import type { CareCircle } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';

interface CircleSwitcherProps {
  circles: CareCircle[];
  selectedId: string;
  onChange: (recipientId: string) => void;
}

/**
 * Navbar dropdown to pick the active care circle. Rendered only when the
 * user belongs to more than one — the flagship single-circle deployment
 * never shows it.
 */
export default function CircleSwitcher({
  circles,
  selectedId,
  onChange,
}: CircleSwitcherProps) {
  const { t } = useI18n();
  if (circles.length < 2) return null;

  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="select"
      style={{ width: 'auto' }}
      aria-label={t('circles.switcherAria')}
    >
      {circles.map((circle) => (
        <option key={circle.recipientId} value={circle.recipientId}>
          {circle.displayName}
        </option>
      ))}
    </select>
  );
}
