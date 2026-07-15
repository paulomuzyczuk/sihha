import React from 'react';

// Segmented choice pill (mood, meds given, …) per components.css .pill.
// Selection is conveyed via aria-pressed, which also drives the styling.

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  emoji?: string;
}

export function Pill({
  active = false,
  emoji,
  className,
  children,
  type = 'button',
  ...rest
}: PillProps) {
  return (
    <button
      type={type}
      className={['pill', className].filter(Boolean).join(' ')}
      aria-pressed={active}
      {...rest}
    >
      {emoji && <span className="emoji">{emoji}</span>}
      {children}
    </button>
  );
}

export function PillGroup({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['pill-group', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
