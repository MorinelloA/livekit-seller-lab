import type { ComponentProps } from 'react';
import { cx } from './cx';

/**
 * A link that leaves the site. It opens in a new tab, so a call in progress
 * isn't hung up, and sends no referrer, so the page's address (which can carry
 * an access code for a moment) never reaches the other site.
 */
export function ExternalLink({ className, children, ...props }: Omit<ComponentProps<'a'>, 'target' | 'rel'>) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={cx('hit text-accent underline-offset-2 hover:underline', className)}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
