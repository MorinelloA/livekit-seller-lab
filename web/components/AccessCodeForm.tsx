'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, TextInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

/**
 * Shown when this browser has no access code, or the one it has was turned down.
 * The API's reason shows under the field, where the fix is.
 */
export function AccessCodeForm({ onSave, error }: { onSave: (code: string) => void; error?: string | null }) {
  const [value, setValue] = useState('');

  // A code is turned down when Call is tapped, in the call bar, maybe far down the page
  // or with the bar over this form. Bring the form into view and focus its field, so the
  // reason is seen, and read with the field.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!error) return;
    formRef.current?.scrollIntoView({ block: 'center' });
    document.getElementById('access-code')?.focus({ preventScroll: true });
    // On a phone the focus opens the keyboard, which can cover the reason under the field.
    // Once the keyboard has settled, bring the reason back into view.
    const viewport = window.visualViewport;
    if (!viewport) return;
    let settle = 0;
    const reveal = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => document.getElementById('access-code-error')?.scrollIntoView({ block: 'nearest' }), 150);
    };
    viewport.addEventListener('resize', reveal);
    const stop = window.setTimeout(() => viewport.removeEventListener('resize', reveal), 2000);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(stop);
      viewport.removeEventListener('resize', reveal);
    };
  }, [error]);

  return (
    <form
      ref={formRef}
      className="rounded-lg border border-warn bg-warn-soft p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      <Field
        id="access-code"
        className="gap-2"
        labelClassName="flex gap-2.5 text-sm text-fg"
        label={
          <>
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-warn" />
            Live calls need an access code, which keeps the hosted agent within its free plans. If you have a link with
            one, the code is after “code=”.
          </>
        }
        error={error}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput
            id="access-code"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="xxxx-xxxx-xxxx"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy('access-code', { error })}
            className="font-mono sm:max-w-xs"
          />
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Save the code
          </Button>
        </div>
      </Field>
    </form>
  );
}
