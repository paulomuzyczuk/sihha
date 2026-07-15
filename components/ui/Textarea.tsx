import React from 'react';

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    invalid?: boolean;
  };

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={['textarea', className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);
