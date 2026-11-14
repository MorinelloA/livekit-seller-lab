'use client';

import { useState } from 'react';

/** Shown when this browser has no access code, or the one it has was turned down. */
export function AccessCodeForm({ onSave }: { onSave: (code: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <form
      className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      <label htmlFor="access-code" className="block text-sm text-amber-950">
        Calls in this lab need an access code. It’s in the link you were sent, after “code=”.
      </label>
      <div className="flex gap-2">
        <input
          id="access-code"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxx-xxxx-xxxx"
          className="w-48 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Save the code
        </button>
      </div>
    </form>
  );
}
