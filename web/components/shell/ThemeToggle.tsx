'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { currentTheme, setTheme, type Theme } from '@/lib/theme';

/**
 * Switches between LiveKit's dark and light palettes. The icon follows the
 * theme through CSS, so the server's HTML and the first client render match.
 */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => setThemeState(currentTheme()), []);

  const toggle = () => {
    const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Light theme"
      aria-pressed={theme === 'light'}
      className="inline-flex size-11 items-center justify-center rounded border border-fill-line bg-fill text-fg transition-colors hover:border-subtle"
    >
      <Icon name="sun" className="hidden size-[18px] dark:block" />
      <Icon name="moon" className="block size-[18px] dark:hidden" />
    </button>
  );
}
