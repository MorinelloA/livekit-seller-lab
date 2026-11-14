'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const link = 'font-medium text-accent underline underline-offset-4';

  return (
    <aside
      aria-label="Pilot"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm"
    >
      <p>
        <span className="font-semibold">Pilot · {pilot}</span>
        {' · '}
        {early ? 'Start with step 1, the check before the lab.' : STEP_LABEL[page]}
        {!early && <span className="text-stone-600"> Your calls are recorded for the pilot.</span>}
      </p>
      <span className="ml-auto">
        {early ? (
          <Link href="/pilot/" className={link}>
            Go to step 1
          </Link>
        ) : page === 'lab' ? (
          <Link href="/practice/" className={link} onClick={() => reachStep('practice')}>
            Done with the lab? Go to the practice call
          </Link>
        ) : (
          <Link href="/pilot/" className={link} onClick={() => reachStep('after')}>
            Done with the practice call? Take the last check
          </Link>
        )}
      </span>
    </aside>
  );
}
