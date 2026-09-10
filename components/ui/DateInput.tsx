import React from 'react';
import { Icon } from './icons';

export type DateInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

/** YYYY-MM-DD → dd/mm/yyyy, the app-wide numeric date standard (see
 * lib/i18n/dictionaries.ts DATE_LOCALES). Returns '' for anything else so a
 * cleared/partial native value renders no caption rather than a garbled one. */
function ddMmYyyy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/**
 * Native `<input type="date">`, plus an always-day-first confirmation caption.
 *
 * The picker's own on-screen digits follow the VISITOR's browser/OS locale —
 * not this app's dd/mm/yyyy standard (lib/i18n/dictionaries.ts DATE_LOCALES)
 * — and that cannot be forced from CSS or JS: per MDN, "there is no way to
 * specify the format of the date... it's automatically done by the browser
 * using the environment locale." A caregiver on an en-US-locale browser sees
 * mm/dd/yyyy in the picker itself regardless of the app's own day-first
 * standard (production, 2026-09-09: an invoice purchase date was entered
 * assuming day-first and silently misread month-first). This caption is the
 * one part of the field that always reads correctly, independent of that
 * browser quirk — every native date input in the app should render through
 * this component rather than a bare `<input type="date">`.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className, invalid, value, ...rest }, ref) {
    const confirmed = typeof value === 'string' ? ddMmYyyy(value) : '';
    return (
      <div>
        <input
          ref={ref}
          type="date"
          className={className}
          aria-invalid={invalid || undefined}
          value={value}
          {...rest}
        />
        {confirmed && (
          <div className="t-xs t-muted" style={{ marginTop: 'var(--space-1)' }}>
            <Icon name="calendar" size={12} /> {confirmed}
          </div>
        )}
      </div>
    );
  },
);
