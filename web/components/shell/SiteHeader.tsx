'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/cx';
import { NAV } from '@/lib/site';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from './Wordmark';

// usePathname() leaves out the base path; trailing slashes vary.
const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

export function SiteHeader() {
  const pathname = withSlash(usePathname() || '/');

  return (
    <header className="border-b border-line-soft">
      <div className="page-column flex flex-wrap items-center gap-x-8">
        <Link href="/" aria-label="Seller Lab, overview" className="flex min-h-16 items-center text-fg">
          <Wordmark />
        </Link>
        <nav
          aria-label="Main"
          className="order-3 -mx-5 flex w-[calc(100%+2.5rem)] gap-6 overflow-x-auto border-t border-line-soft px-5 text-sm sm:-mx-10 sm:w-[calc(100%+5rem)] sm:px-10 md:order-none md:mx-0 md:w-auto md:border-0 md:px-0"
        >
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'hit inline-flex min-h-11 shrink-0 items-center whitespace-nowrap transition-colors',
                  active ? 'text-fg shadow-[inset_0_-2px_0_var(--accent)]' : 'text-subtle hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
