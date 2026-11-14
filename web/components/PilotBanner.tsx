'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { currentStep, type Progress, reachStep, readProgress, STEP_LABEL } from '@/lib/pilot';

/**
 * For pilot participants only: which step they're on, that their calls are
 * recorded, and the way on to the next step.
 */
export function PilotBanner({ pilot, page }: { pilot: string; page: 'lab' | 'practice' }) {
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    // Arriving at the practice page from the lab moves the participant on.
    const now = readProgress();
    setProgress(page === 'practice' && currentStep(now) === 'lab' ? reachStep('practice') : now);
  }, [page]);

  const step = currentStep(progress);
  const early = step === 'consent' || step === 'before';
  const link = 'inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline';

  return (
    <aside
      aria-label="Pilot"
      className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm text-fg"
    >
      <p className="m-0 py-2">
        <span className="font-mono text-xs font-bold tracking-[0.12em] uppercase">Pilot · {pilot}</span>
        {' · '}
        {early ? 'Start with step 1, the check before the lab.' : STEP_LABEL[page]}
        {!early && <span className="text-body"> Your calls are recorded for the pilot.</span>}
      </p>
      <span className="ml-auto">
        {early ? (
          <Link href="/pilot/" className={link}>
            Go to step 1
            <Icon name="arrow" className="size-3.5" />
          </Link>
        ) : page === 'lab' ? (
          <Link href="/practice/" className={link} onClick={() => reachStep('practice')}>
            Done with the lab? Go to the practice call
            <Icon name="arrow" className="size-3.5" />
          </Link>
        ) : (
          <Link href="/pilot/" className={link} onClick={() => reachStep('after')}>
            Done with the practice call? Take the last check
            <Icon name="arrow" className="size-3.5" />
          </Link>
        )}
      </span>
    </aside>
  );
}
