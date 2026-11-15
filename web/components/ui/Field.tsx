import type { ComponentProps, ReactNode } from 'react';
import { oneLine } from '@/lib/text';
import { cx } from './cx';

/**
 * The kit's field: 44px tall, an edge at 3:1 or more (--control-line), and 16px
 * text on touch screens, because iOS zooms in on anything smaller.
 */
export const fieldClass =
  'min-h-11 w-full min-w-0 rounded border border-control-line bg-page px-3 text-sm text-fg placeholder:text-subtle touch:text-base disabled:cursor-not-allowed disabled:opacity-50';

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(fieldClass, className)} {...props} />;
}

/** A field that grows with its text, for anything longer than a few words. */
export function TextArea({ className, rows = 2, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cx(fieldClass, 'resize-y py-2.5 leading-normal [field-sizing:content]', className)}
      {...props}
    />
  );
}

/**
 * Text that must stay on one line but can be longer than its box (a name, a
 * rule): it wraps and grows instead of scrolling out of sight. Enter and pasted
 * line breaks never reach the value, so it's the same as a single-line field's.
 */
export function WrappingInput({ onChange, onKeyDown, ...props }: ComponentProps<'textarea'>) {
  return (
    <TextArea
      rows={1}
      {...props}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
        onKeyDown?.(e);
      }}
      onChange={(e) => {
        const flat = oneLine(e.target.value);
        if (flat !== e.target.value) e.target.value = flat;
        onChange?.(e);
      }}
    />
  );
}

/** The ids a field's hint and error get, for its aria-describedby. */
export function describedBy(id: string, parts: { hint?: ReactNode; error?: ReactNode }): string | undefined {
  const ids = [parts.hint ? `${id}-hint` : '', parts.error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/**
 * A label above its field, with an optional hint and error below it. Give the
 * field `id` and `aria-describedby={describedBy(id, { hint, error })}`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  labelClassName,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** In place of the kit's 13px semibold label, for a label that's a sentence. */
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={labelClassName ?? 'text-small font-semibold text-fg'}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-small text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
