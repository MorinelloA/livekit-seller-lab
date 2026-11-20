import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AdoptLinkParams } from '@/components/shell/AdoptLinkParams';
import { SiteFooter } from '@/components/shell/SiteFooter';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { THEME_SCRIPT } from '@/lib/theme';
import { commitMono, publicSans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  // Absolute URLs for the social card (app/opengraph-image.png), which link previews need.
  metadataBase: new URL('https://tonyt908.com'),
  title: {
    default: 'Seller Lab: Why Real-Time Voice AI Is Hard',
    template: '%s · Seller Lab',
  },
  description: 'A hands-on LiveKit lab for new sellers.',
  // Links can carry the access code, so search engines skip the site.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${publicSans.variable} ${commitMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only rounded bg-accent px-4 py-2 font-semibold text-on-accent focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <AdoptLinkParams />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
