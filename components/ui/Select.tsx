import React from 'react';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={['select', className].filter(Boolean).join(' ')}
        {...rest}
      />
    );
  },
);
