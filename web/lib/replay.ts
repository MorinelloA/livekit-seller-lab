// A recorded test-caller run, as the overview and the lab replay it. Captured in
// development with ?capture on the lab page and scripts/capture-server.mjs.
// Only types come from the bundler's side, so `node --test` can run it.

import type { ExperimentId } from './experiments';
import type { Peaks } from './peaks';
import type { LoggedEvent, LoggedTurn, Mode } from './protocol';
import { firstExchange, PAUSE_PARTS } from './runSummary.ts';
import { settingsFor } from './settings.ts';
import type { ClipKey, RunTimeline } from './timeline';

export interface ReplayRun {
  v: 1;
  /** ISO date of the capture. */
  capturedAt: string;
  timeline: RunTimeline;
  events: LoggedEvent[];
  peaks: Partial<Record<ClipKey, Peaks>>;
  /**
   * The recording of the run (caller and Juniper): the run's clock in ms at its
   * first sample, and how long it plays once the silence after the last sound
   * is trimmed.
   */
  audio: { src: string; offsetMs: number; durationMs?: number } | null;
}

/** A recording's name: its JSON in lib/replays and its WAV in public/replay. */
export const recordingName = (experiment: ExperimentId, mode: Mode) => `exp${experiment}-${mode}`;

/** The day a run was captured, as the pages write it: "14 Nov 2026". */
export function capturedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Where the run's lanes line up, in ms on its own clock. */
const alignmentOf = (timeline: RunTimeline) => timeline.alignAt ?? timeline.clips[0]?.start ?? 0;

/** A position in the recording (ms) as a place on the timeline: ms from the run's alignment point. */
export function playheadMs(run: ReplayRun, positionMs: number): number {
  return (run.audio?.offsetMs ?? 0) + positionMs - alignmentOf(run.timeline);
}

/**
 * The run's timeline, ending where its recording does. A run waits a few
 * seconds after the last sound to be sure Juniper has finished, and the
 * recording has that wait trimmed off, so the figure leaves it out too.
 */
export function recordedTimeline(run: ReplayRun): RunTimeline {
  const { timeline, audio } = run;
  if (!audio || audio.durationMs == null || timeline.endAt === null) return timeline;
  const lastMark = Math.max(0, ...timeline.states.map((s) => s.at), ...timeline.clips.map((c) => c.end));
  return { ...timeline, endAt: Math.min(timeline.endAt, Math.max(lastMark, audio.offsetMs + audio.durationMs)) };
}

/**
 * The samples up to the last sound, plus `keepMs` so the ending isn't clipped.
 * A run goes on recording while it waits to be sure Juniper has finished.
 */
export function trimTrailingSilence(samples: Float32Array, sampleRate: number, threshold = 0.005, keepMs = 500): Float32Array {
  let last = samples.length - 1;
  while (last >= 0 && Math.abs(samples[last]) <= threshold) last -= 1;
  const end = Math.min(samples.length, last + 1 + Math.round((keepMs / 1000) * sampleRate));
  return samples.subarray(0, end);
}

/**
 * Why a take can't back up its summary sentence or its figure, one reason per
 * entry. An empty list means it can be shown as a recording of that experiment
 * on that setting.
 */
export function captureProblems(experiment: ExperimentId, mode: Mode, run: ReplayRun): string[] {
  const { timeline, events, audio } = run;
  const turns = events.filter((e): e is LoggedTurn => e.type === 'turn');
  const problems: string[] = [];

  if (timeline.experiment !== experiment || timeline.mode !== mode) {
    problems.push(`It’s a run of Experiment ${timeline.experiment} on ${timeline.mode ?? 'no setting'}, not Experiment ${experiment} on ${mode}.`);
  }
  if (timeline.status !== 'done') problems.push('The run didn’t finish.');
  if (!audio) problems.push('No recording was saved with it, so there’s nothing to play.');
  else if (audio.durationMs == null) problems.push('The recording’s length wasn’t saved, so the clock can’t show it.');
  if (timeline.skewMs === null) problems.push('The agent’s clock wasn’t measured, so the figure can’t place what Juniper said.');
  if (turns.length === 0) problems.push('The agent reported no turns.');

  // The figure marks cut-offs from Juniper's turns. The caller's turns aren't drawn, so theirs can be missing.
  const untimed = turns.filter(
    (t) => t.role === 'assistant' && (t.metrics.started_speaking_at == null || t.metrics.stopped_speaking_at == null),
  ).length;
  if (untimed > 0) problems.push(`${untimed} of Juniper’s turns came without the times its speech started and stopped.`);

  const wanted = settingsFor(experiment, mode);
  const keys = Object.keys(wanted) as (keyof typeof wanted)[];
  const other = events.filter((e) => 'settings' in e && keys.some((key) => e.settings[key] !== wanted[key])).length;
  if (other > 0) problems.push(`${other} of its events were made on other settings than Experiment ${experiment}’s ${mode}.`);

  if (experiment === 4) {
    // The pause's figure draws every part of the first exchange.
    const exchange = firstExchange(turns);
    const missing = PAUSE_PARTS.filter((part) => (part.from === 'user' ? exchange?.user : exchange?.assistant)?.metrics[part.key] == null);
    if (missing.length > 0) problems.push(`The first answer has no figure for: ${missing.map((part) => part.label).join(', ')}.`);
  }
  return problems;
}

/** Where sound first rises above `threshold`, in ms, or null in silence. */
export function firstSoundMs(samples: Float32Array, sampleRate: number, threshold = 0.02): number | null {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) return (i / sampleRate) * 1000;
  }
  return null;
}

/** 16-bit mono WAV, averaged down to `outRate` (24 kHz keeps a voice clear at half the size). */
export function encodeWav(samples: Float32Array, inRate: number, outRate = 24_000): Blob {
  const ratio = Math.max(1, Math.round(inRate / outRate));
  const rate = inRate / ratio;
  const length = Math.floor(samples.length / ratio);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < ratio; j++) sum += samples[i * ratio + j];
    const s = Math.max(-1, Math.min(1, sum / ratio));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
