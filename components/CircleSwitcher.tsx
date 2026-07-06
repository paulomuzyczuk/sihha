'use client';

import React from 'react';
import type { CareCircle } from '../lib/circles';

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
  if (circles.length < 2) return null;

  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="form-input"
      style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
      aria-label="Círculo de cuidado"
    >
      {circles.map((circle) => (
        <option key={circle.recipientId} value={circle.recipientId}>
          {circle.displayName}
        </option>
      ))}
    </select>
  );
}
