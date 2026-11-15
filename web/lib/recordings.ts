// The recorded runs the site can play: one real take of each experiment on both
// settings, so a visitor without a call can still hear every experiment.
// Type-only imports at the top, so `node --test` can read the list.

import type { ExperimentId } from './experiments';
import type { Mode } from './protocol';
import type { ReplayRun } from './replay';

/** One experiment's two takes. */
export type Recording = Record<Mode, ReplayRun>;

/** The experiments with a recording. The overview's picker, the lab's buttons and the tests all read this list. */
export const RECORDED: ExperimentId[] = [1, 2, 3, 4];

type Take = { default: unknown };

// One literal import() per file: the bundler gives each its own chunk, and a
// page fetches it only when someone asks for that experiment.
const LOADERS: Record<ExperimentId, () => Promise<[Take, Take]>> = {
  1: () => Promise.all([import('./replays/exp1-baseline.json'), import('./replays/exp1-enhanced.json')]),
  2: () => Promise.all([import('./replays/exp2-baseline.json'), import('./replays/exp2-enhanced.json')]),
  3: () => Promise.all([import('./replays/exp3-baseline.json'), import('./replays/exp3-enhanced.json')]),
  4: () => Promise.all([import('./replays/exp4-baseline.json'), import('./replays/exp4-enhanced.json')]),
};

const cache = new Map<ExperimentId, Promise<Recording>>();

/** An experiment's two takes, fetched once per page; later calls share the result. */
export function loadRecording(id: ExperimentId): Promise<Recording> {
  let pending = cache.get(id);
  if (!pending) {
    pending = LOADERS[id]().then(([baseline, enhanced]) => ({
      baseline: baseline.default as ReplayRun,
      enhanced: enhanced.default as ReplayRun,
    }));
    cache.set(id, pending);
    // A failed fetch isn't kept, so Retry asks again.
    pending.catch(() => cache.delete(id));
  }
  return pending;
}
