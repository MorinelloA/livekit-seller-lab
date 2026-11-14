import type { SVGProps } from 'react';

// Line icons in LiveKit's plain style, drawn with currentColor. Decorative by
// default: give the control around them its accessible name.

const PATHS = {
  play: <path d="M5 3.2v9.6L13 8z" fill="currentColor" stroke="none" />,
  pause: <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" stroke="none" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  check: <path d="M3.5 8.3l2.8 2.8 6.2-6.2" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  mic: (
    <>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
    </>
  ),
  phone: (
    <path d="M5.6 2.2l1.5 3-1.4 1.1a8 8 0 0 0 4 4l1.1-1.4 3 1.5-.6 2.6c-.1.4-.5.7-.9.6A12 12 0 0 1 2.4 3.6c0-.4.2-.8.6-.9z" />
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </>
  ),
  moon: <path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" />,
  alert: (
    <>
      <path d="M8 2l6.5 11.5h-13z" />
      <path d="M8 6.5v3M8 11.7v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 7.2v4M8 4.9v.01" />
    </>
  ),
  cafe: (
    <>
      <path d="M2.5 6h8.5v3.5a3.5 3.5 0 0 1-3.5 3.5H6a3.5 3.5 0 0 1-3.5-3.5z" />
      <path d="M11 7h1a1.8 1.8 0 0 1 0 3.6h-1.2M5 2.5v1.5M7.5 2.5v1.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
