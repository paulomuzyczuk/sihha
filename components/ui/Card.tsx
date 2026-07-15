import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Resting variant — no shadow, cream surface */
  flat?: boolean;
  /** Lift the legacy 480px max-width (grid/column layouts) */
  wide?: boolean;
}

export function Card({ flat, wide, className, ...rest }: CardProps) {
  return (
    <div
      className={['card', flat && 'card-flat', wide && 'card-wide', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

/** Card as a <form>, for the write-only entry screens. */
export function CardForm({
  flat,
  wide,
  className,
  ...rest
}: CardProps & React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={['card', flat && 'card-flat', wide && 'card-wide', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
