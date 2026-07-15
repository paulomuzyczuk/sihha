import React from 'react';
import { Icon, IconName } from './icons';

// Verification chip (geolocation) per components.css .chip.

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  verified?: boolean;
  icon?: IconName;
}

export function Chip({
  verified,
  icon = 'location',
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={['chip', verified && 'chip-verified', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}
