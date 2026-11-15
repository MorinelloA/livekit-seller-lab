'use client';

import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { cx } from './cx';

/**
 * A box that scrolls sideways when its content (a table, a diagram, code) is wider
 * than the screen. While it scrolls, it can be focused and scrolled from the keyboard,
 * and it's a named region (WCAG 2.1.1); while it fits, it's just a box.
 */
export function Scroller({ label, className, children, ...props }: ComponentProps<'div'> & { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
      tabIndex={scrolls ? 0 : undefined}
      className={cx('overflow-x-auto', className)}
      {...props}
    >
      {children}
    </div>
  );
}
