'use client';

import { useEffect, useState } from 'react';
import { Eyebrow } from '@/components/ui/Bits';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

export interface OutlineItem {
  id: string;
  label: string;
  done: boolean;
}

/** Which section is on screen: the last one whose top has scrolled past a third of the window. */
function useCurrentSection(ids: string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    const update = () => {
      let found: string | null = null;
      for (const id of key.split(',')) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight / 3) found = id;
      }
      setCurrent(found);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [key]);
  return current;
}

/** The lab's sections down the side, on wide screens: where you are, and what's done. */
export function LabOutline({ items }: { items: OutlineItem[] }) {
  const current = useCurrentSection(items.map((item) => item.id));
  return (
    <nav aria-label="Lab outline" className="hidden lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-1 lg:self-start">
      <Eyebrow className="mb-2 text-[11px]">Lab outline</Eyebrow>
      {items.map((item) => {
        const here = item.id === current;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={here ? 'location' : undefined}
            className={cx(
              'flex min-h-10 items-center gap-2.5 rounded px-2.5 text-sm transition-colors',
              here ? 'bg-fill text-fg' : 'text-subtle hover:text-fg',
            )}
          >
            {item.done ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                <Icon name="check" className="size-3" strokeWidth={2} />
                <span className="sr-only">Done: </span>
              </span>
            ) : (
              <span aria-hidden className="size-4 shrink-0 rounded-full border-[1.5px] border-line" />
            )}
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
