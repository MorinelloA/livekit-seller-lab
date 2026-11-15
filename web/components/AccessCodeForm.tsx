'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { describedBy, Field, TextInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

/**
 * Shown when this browser has no access code, or the one it has was turned down.
 * The API's reason shows under the field, where the fix is.
 */
export function AccessCodeForm({ onSave, error }: { onSave: (code: string) => void; error?: string | null }) {
  const [value, setValue] = useState('');

  return (
    <form
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
            Calls in this lab need an access code. It’s in the link you were sent, after “code=”.
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
