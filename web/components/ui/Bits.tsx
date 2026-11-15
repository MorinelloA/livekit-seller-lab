import { Children, type ReactNode } from 'react';
import { splitBrand } from '@/lib/text';
import { cx } from './cx';
import { Icon } from './Icon';

/**
 * LiveKit's brand guide: the name is never written "LIVEKIT". In a label set in
 * capitals, the name keeps its own case.
 */
export function brandCase(node: ReactNode): ReactNode {
  if (typeof node !== 'string' || !node.includes('LiveKit')) return node;
  return splitBrand(node).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="normal-case">
        LiveKit
      </span>
    ) : (
      part
    ),
  );
}

/** LiveKit's section label: mono, bold, spaced capitals. */
export function Eyebrow({
  as: Tag = 'p',
  tone = 'subtle',
  size = 'md',
  className,
  id,
  children,
}: {
  as?: 'p' | 'span' | 'h2' | 'h3' | 'dt';
  tone?: 'subtle' | 'accent' | 'ok' | 'warn';
  /** md: the page-level label, 12px. sm: the kit's card label, 11px. */
  size?: 'md' | 'sm';
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const color = { subtle: 'text-subtle', accent: 'text-accent', ok: 'text-ok', warn: 'text-warn' }[tone];
  return (
    <Tag id={id} className={cx(size === 'sm' ? 'eyebrow-sm' : 'eyebrow', color, className)}>
      {Children.map(children, brandCase)}
    </Tag>
  );
}

const PILL_TONES = {
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  warn: 'border border-warn text-warn',
  accent: 'bg-accent-soft text-accent',
  neutral: 'border border-line text-subtle',
} as const;

export function Pill({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex min-h-6.5 items-center gap-1.5 rounded-full px-2.5 font-mono text-label font-bold tracking-pill uppercase',
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const CALLOUT_TONES = {
  warn: { box: 'border-warn/60 bg-warn-soft', icon: 'text-warn', name: 'alert' },
  bad: { box: 'border-bad-line bg-bad-soft', icon: 'text-bad', name: 'alert' },
  info: { box: 'border-line bg-surface', icon: 'text-subtle', name: 'info' },
} as const;

/** A message with an icon. role="status" by default, so screen readers hear it when it appears. */
export function Callout({
  tone = 'warn',
  role = 'status',
  className,
  children,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  role?: 'status' | 'note' | 'alert';
  className?: string;
  children: ReactNode;
}) {
  const t = CALLOUT_TONES[tone];
  return (
    <div role={role} className={cx('flex gap-3 rounded-md border px-4 py-3 text-sm leading-relaxed text-fg', t.box, className)}>
      <Icon name={t.name} className={cx('mt-0.5 size-4 shrink-0', t.icon)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Two or more mutually exclusive choices, each a pressed or unpressed button. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      // When the labels don't fit and the items wrap, 6px between rows leaves each 38px
      // item room for its 44px touch area.
      className="inline-flex max-w-full flex-wrap gap-x-0.5 gap-y-1.5 rounded-md border border-control-line bg-page p-0.75"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'hit min-h-9.5 rounded px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'bg-fg text-page' : 'text-subtle hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Right or wrong, as the kit's line icons, with the word for screen readers.
 * The kit draws icons as line SVGs, never as ✓ or ✗ glyphs.
 */
export function RightWrong({ right }: { right: boolean }) {
  return (
    <>
      <Icon name={right ? 'check' : 'x'} className={cx('inline-block size-3.5 align-middle', right ? 'text-ok' : 'text-bad')} />
      <span className="sr-only">{right ? ' right' : ' wrong'}</span>
    </>
  );
}

/** Up to two points, as filled and empty dots. */
export function Points({ score, max = 2 }: { score: number; max?: number }) {
  return (
    <span className="flex shrink-0 gap-1.25 pt-1.5" role="img" aria-label={`${score} of ${max} points`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx('size-2.75 rounded-full', i < score ? 'bg-accent' : 'border-[1.5px] border-control-line')}
        />
      ))}
    </span>
  );
}
