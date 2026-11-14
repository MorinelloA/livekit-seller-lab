'use client';

import { useState } from 'react';
import { inputClass } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

/** Shown when this browser has no access code, or the one it has was turned down. */
export function AccessCodeForm({ onSave }: { onSave: (code: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-warn/60 bg-warn-soft p-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      <label htmlFor="access-code" className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-fg">
        <span className="flex gap-2.5">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-warn" />
          Calls in this lab need an access code. It’s in the link you were sent, after “code=”.
        </span>
        <input
          id="access-code"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxx-xxxx-xxxx"
          className={cx(inputClass, 'max-w-xs font-mono')}
        />
      </label>
      <Button type="submit" variant="primary" disabled={!value.trim()}>
        Save the code
      </Button>
    </form>
  );
}
