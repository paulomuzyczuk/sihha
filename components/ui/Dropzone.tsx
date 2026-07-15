import React from 'react';
import { Icon } from './icons';

// Invoice upload dropzone per components.css .dropzone. Purely
// presentational — the caller owns the drag/drop and file-input logic.

export interface DropzoneProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  /** Selected file name; when present it replaces the prompt */
  fileName?: string;
  prompt: React.ReactNode;
  hint?: React.ReactNode;
}

export function Dropzone({
  active,
  fileName,
  prompt,
  hint,
  className,
  ...rest
}: DropzoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={['dropzone', active && 'active', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon name={fileName ? 'receipt' : 'upload'} size={32} />
      {fileName ? (
        <span className="dropzone-filename">{fileName}</span>
      ) : (
        <span className="t-sm" style={{ fontWeight: 600 }}>
          {prompt}
        </span>
      )}
      {hint && <span className="dz-hint">{hint}</span>}
    </div>
  );
}
