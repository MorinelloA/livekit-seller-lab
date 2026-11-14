import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/** LiveKit's section label: mono, bold, spaced capitals. */
export function Eyebrow({
  as: Tag = 'p',
  tone = 'subtle',
  className,
  id,
  children,
}: {
  as?: 'p' | 'span' | 'h2' | 'h3' | 'dt';
  tone?: 'subtle' | 'accent' | 'ok' | 'warn';
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const color = { subtle: 'text-subtle', accent: 'text-accent', ok: 'text-ok', warn: 'text-warn' }[tone];
  return (
    <Tag id={id} className={cx('eyebrow', color, className)}>
      {children}
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
        'inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] font-bold tracking-[0.12em] uppercase',
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
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-md border border-line bg-page p-[3px]">
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
              'min-h-9 rounded px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
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

export const inputClass =
  'min-h-11 w-full rounded border border-line bg-page px-3 text-sm text-fg placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-50';

/** A panel: LiveKit's raised card with a hairline border. */
export function panelClass(className?: string): string {
  return cx('rounded-lg border border-line bg-surface', className);
}

/** Up to two points, as filled and empty dots. */
export function Points({ score, max = 2 }: { score: number; max?: number }) {
  return (
    <span className="flex shrink-0 gap-[5px] pt-1.5" role="img" aria-label={`${score} of ${max} points`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx('size-[11px] rounded-full', i < score ? 'bg-accent' : 'border-[1.5px] border-line')}
        />
      ))}
    </span>
  );
}
