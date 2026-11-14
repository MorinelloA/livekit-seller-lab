import { cx } from '@/components/ui/cx';

/**
 * Seller Lab's own mark: a caller's turn and the agent's reply, offset in time.
 * LiveKit's wordmark and symbol are LiveKit's, so the site doesn't wear them.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden focusable="false">
        <rect x="2" y="6" width="11" height="3.5" rx="1.75" className="fill-subtle" />
        <rect x="9" y="12.5" width="11" height="3.5" rx="1.75" className="fill-accent" />
      </svg>
      <span className="text-base font-semibold tracking-[-0.01em]">Seller Lab</span>
    </span>
  );
}
