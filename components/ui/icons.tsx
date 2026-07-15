import React from 'react';

// Sihha house-style icon set, ported from design_system/icons.js.
// House rules: 24px grid, 1.75px stroke, round caps/joins, currentColor,
// outlines only — the brand mark is the one filled shape.

export type IconName =
  | 'heart'
  | 'mood'
  | 'pill'
  | 'upload'
  | 'receipt'
  | 'location'
  | 'bell'
  | 'calendar'
  | 'check'
  | 'check-circle'
  | 'alert'
  | 'clock'
  | 'mail'
  | 'users'
  | 'shield'
  | 'plus'
  | 'arrow-right'
  | 'leaf'
  | 'book';

const PATHS: Record<IconName, React.ReactNode> = {
  heart: (
    <path d="M12 20c-5-3.2-8-6-8-9.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 3.4C20 14 17 16.8 12 20Z" />
  ),
  mood: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5s1.3 1.5 3.5 1.5 3.5-1.5 3.5-1.5" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  pill: (
    <>
      <rect
        x="3.5"
        y="8.5"
        width="17"
        height="7"
        rx="3.5"
        transform="rotate(-45 12 12)"
      />
      <path d="M8.6 8.6l6.8 6.8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4V3.5Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5H4.5s2-1.5 2-6.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 3.5 19h17L12 4.5Z" />
      <path d="M12 10v4M12 16.7h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 5.5L19.5 7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.3-4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.5 3 7.4 7 9 4-1.6 7-4.5 7-9V6l-7-2.5Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  leaf: (
    <>
      <path d="M5 19c0-8 6-13 14-13 0 8-5 14-14 13Z" />
      <path d="M9 15c2-3 4-4.5 7-5.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H5Z" />
      <path d="M5 4.5v15" />
    </>
  ),
};

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The Sihha brand mark — a young sprout kept growing by steady hands. */
export function SihhaMark({
  size = 26,
  style,
  ...rest
}: { size?: number } & React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      {...rest}
    >
      <path
        d="M20 34V17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M20 22c-1.6-6.4-6.4-8.6-11.8-8.6C8.2 19.8 12.5 23 20 23Z"
        fill="currentColor"
      />
      <path
        d="M20 18c1.3-5.4 5.4-7.1 9.7-7.1 0 5.4-3.7 8.2-9.7 8.2Z"
        fill="currentColor"
        opacity="0.68"
      />
    </svg>
  );
}
