import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seller Lab 1: Why Real-Time Voice AI Is Hard',
  description: 'A hands-on LiveKit lab for new sellers.',
  // The lab is only for the people it's sent to, so search engines skip it.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
