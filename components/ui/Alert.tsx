import React from 'react';
import { Icon, IconName } from './icons';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const DEFAULT_ICONS: Record<AlertVariant, IconName> = {
  info: 'check-circle',
  success: 'check-circle',
  warning: 'bell',
  danger: 'alert',
};

export interface AlertProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'title'
> {
  variant?: AlertVariant;
  title?: React.ReactNode;
  icon?: IconName;
}

export function Alert({
  variant = 'info',
  title,
  icon,
  className,
  children,
  ...rest
}: AlertProps) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={['alert', `alert-${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon
        name={icon ?? DEFAULT_ICONS[variant]}
        size={20}
        className="alert-icon"
      />
      <div className="alert-body">
        {title && <span className="alert-title">{title}</span>}
        {children && <span className="alert-text">{children}</span>}
      </div>
    </div>
  );
}
