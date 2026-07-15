import React from 'react';
import { Icon } from './icons';

// Field wrapper — label / control / hint / error, per components.css .field.

export interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Rendered on the same line as the label, right-aligned (e.g. "Forgot?") */
  labelEnd?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  labelEnd,
  children,
  className,
  style,
}: FieldProps) {
  const labelNode = (
    <label className="field-label" htmlFor={htmlFor}>
      {label}
      {required && <span className="req">*</span>}
    </label>
  );
  return (
    <div
      className={['field', className].filter(Boolean).join(' ')}
      style={style}
    >
      {labelEnd ? (
        <div className="field-row">
          {labelNode}
          {labelEnd}
        </div>
      ) : (
        labelNode
      )}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error">
          <Icon name="alert" size={13} />
          {error}
        </span>
      )}
    </div>
  );
}
