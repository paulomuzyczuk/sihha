import React from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';
export type BadgeRole = 'therapist' | 'patient' | 'admin';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Status dot before the label */
  dot?: boolean;
}

export function Badge({
  variant = 'neutral',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={['badge', `badge-${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

/** Uppercase care-team role badge (therapist / patient / admin pairings). */
export function RoleBadge({
  role,
  className,
  ...rest
}: { role: BadgeRole } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={['badge', 'badge-role', `badge-${role}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
