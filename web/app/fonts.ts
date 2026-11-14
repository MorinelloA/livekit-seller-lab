import { Public_Sans } from 'next/font/google';
import localFont from 'next/font/local';

// The faces livekit.com loads: Public Sans for reading, Commit Mono for labels,
// times and code. LiveKit's display face (Everett) is licensed, so headings use
// Public Sans Light at the same weight and tracking.

export const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

// Commit Mono 1.143 (SIL Open Font License, see CommitMono-OFL.txt), converted
// from the release's OTF files to woff2.
export const commitMono = localFont({
  src: [
    { path: './fonts/CommitMono-400-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/CommitMono-700-Regular.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-commit-mono',
  display: 'swap',
  // Next's default fallback metrics come from Arial, which is wrong for a
  // monospace face.
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
});
