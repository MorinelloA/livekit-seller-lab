// The agent's settings for each experiment. The lab sends them before a run, and a
// recording is checked against them (lib/replay.ts). Type-only imports, so
// `node --test` can run it without a bundler.

import type { ExperimentId } from './experiments';
import type { LabSettings, Mode } from './protocol';

// Production settings, except voice isolation: it's billed by the minute, so the
// agent runs it only while Experiment 3's Enhanced setting is on.
export const DEFAULT_SETTINGS: LabSettings = {
  turn_detection: 'enhanced',
  interruptions: 'enhanced',
  noise: 'baseline',
  model: 'fast',
};

/** Each experiment changes one setting and keeps the others as they are by default. */
export function settingsFor(experiment: ExperimentId, mode: Mode): LabSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (experiment === 1) settings.turn_detection = mode;
  if (experiment === 2) settings.interruptions = mode;
  if (experiment === 3) settings.noise = mode;
  if (experiment === 4) settings.model = mode === 'enhanced' ? 'reasoning' : 'fast';
  return settings;
}

/** Which of an experiment's two settings is on now. */
export function modeOf(experiment: ExperimentId, settings: LabSettings): Mode {
  if (experiment === 1) return settings.turn_detection;
  if (experiment === 2) return settings.interruptions;
  if (experiment === 3) return settings.noise;
  return settings.model === 'reasoning' ? 'enhanced' : 'baseline';
}
