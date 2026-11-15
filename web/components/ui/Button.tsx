import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';
// stack: md, but full width at the kit's 48px and 15px on a phone, as the kit draws a
// page's main buttons at 390px.
type Size = 'md' | 'sm' | 'stack';

// max-w-full and text-center: a label longer than the screen wraps inside the button
// instead of pushing it off the side.
const BASE =
  'inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded text-center font-semibold transition-[background-color,border-color,color,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-60';

// Disabled, as the kit draws it ("Lock in a prediction first"): a neutral button with the
// subtle ink, whatever its variant, so a disabled primary doesn't read as the next step.
const DISABLED = 'disabled:border disabled:border-fill-line disabled:bg-fill disabled:text-subtle disabled:hover:brightness-100';

const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-sm',
  stack: 'min-h-11 px-4 text-sm max-sm:w-full max-sm:min-h-12 max-sm:text-card',
  sm: 'hit min-h-9 px-3 text-small',
};

// Primary is LiveKit's accent fill with dark text on cyan, white on blue.
// Secondary is the translucent fill livekit.com uses for its quieter buttons.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
  secondary: 'border border-fill-line bg-fill text-fg hover:border-subtle',
  danger: 'border border-bad-soft bg-bad-soft text-bad hover:border-bad-line',
  // As the kit draws a quiet link: the accent ink, underlined on hover.
  quiet: 'min-h-11 px-0 text-sm text-accent underline-offset-4 hover:underline',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string): string {
  return cx(BASE, variant === 'quiet' ? undefined : SIZES[size], VARIANTS[variant], variant === 'quiet' ? undefined : DISABLED, className);
}

type Styled = { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = 'button', ...props }: ComponentProps<'button'> & Styled) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Styled) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
