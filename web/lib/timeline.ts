// The conversation timeline: what one test-caller run sounded like, second by
// second. The page records when each clip played and when Juniper's state
// changed; the agent reports when each turn's speech started and stopped. This
// module turns those into lanes to draw. Type-only imports, so `node --test`
// can run it without a bundler.

import type { CLIPS, ExperimentId } from './experiments';
import type { LoggedEvent, LoggedTurn, Mode } from './protocol';

export type ClipKey = keyof typeof CLIPS;

/** A clip the test caller played, in ms from the start of the run. */
export interface ClipPlay {
  clip: ClipKey;
  start: number;
  end: number;
}

/** Juniper's published state (listening, thinking, speaking), from the moment the page saw it change. */
export interface StateMark {
  state: string;
  at: number;
}

export interface RunTimeline {
  v: 1;
  /** 0 is Make it your own's booking run. */
  experiment: ExperimentId | 0;
  mode: Mode | null;
  status: 'running' | 'done' | 'failed';
  /** Date.now() when the run's clock started. */
  t0Epoch: number;
  /** performance.now() at the same moment. Only while the run is on screen; never saved. */
  t0Perf?: number;
  /** The agent's clock minus the page's, in ms; null when the agent didn't report its clock. */
  skewMs: number | null;
  /** Where runs line up, in ms: the first "uh-huh" in Experiment 2, the first clip otherwise. */
  alignAt: number | null;
  endAt: number | null;
  clips: ClipPlay[];
  states: StateMark[];
}

/** Records one run on the page's monotonic clock. */
export class RunRecorder {
  private readonly t0 = performance.now();
  private readonly alignClip: ClipKey | null;
  private readonly data: RunTimeline;

  constructor(options: { experiment: ExperimentId | 0; mode: Mode | null; skewMs: number | null; state: string }) {
    // Experiment 2's "uh-huh"s wait for Juniper to start speaking, so their
    // timing moves with Juniper's response time. After the first one, the
    // fixed pauses make everything line up.
    this.alignClip = options.experiment === 2 ? 'uhHuh' : null;
    this.data = {
      v: 1,
      experiment: options.experiment,
      mode: options.mode,
      status: 'running',
      t0Epoch: Date.now(),
      t0Perf: this.t0,
      skewMs: options.skewMs,
      alignAt: null,
      endAt: null,
      clips: [],
      states: [{ state: options.state, at: 0 }],
    };
  }

  private now(): number {
    return Math.round(performance.now() - this.t0);
  }

  state(state: string): void {
    const marks = this.data.states;
    if (marks[marks.length - 1]?.state !== state) marks.push({ state, at: this.now() });
  }

  /** `startedAt` is performance.now() when the clip started; `duration` is in seconds. */
  clip(clip: ClipKey, startedAt: number, duration: number): void {
    const start = Math.round(startedAt - this.t0);
    this.data.clips.push({ clip, start, end: start + Math.round(duration * 1000) });
    if (this.data.alignAt === null && (this.alignClip === null || clip === this.alignClip)) {
      this.data.alignAt = start;
    }
  }

  finish(status: 'done' | 'failed'): void {
    if (this.data.status !== 'running') return;
    this.data.status = status;
    this.data.endAt = this.now();
  }

  snapshot(): RunTimeline {
    return { ...this.data, clips: [...this.data.clips], states: [...this.data.states] };
  }
}

export interface Span {
  start: number;
  end: number;
}

export interface SpeechSpan extends Span {
  /** The caller talked over it and the reply stopped. */
  interrupted: boolean;
  text: string;
  /** Matched to a turn the agent reported, so its words and cut-off are known. */
  exact: boolean;
}

/** One run, ready to draw. All times are ms from the run's alignment point. */
export interface Lanes {
  clips: ClipPlay[];
  speaking: SpeechSpan[];
  thinking: Span[];
  /** Experiment 2's Baseline: Juniper stopped for an "uh-huh", then picked the sentence back up. */
  stalls: Span[];
  /** The caller's turns as the agent heard them, when the agent reported the times. */
  heard: (Span & { text: string })[];
  end: number;
}

const turnsOf = (events: LoggedEvent[]) => events.filter((e): e is LoggedTurn => e.type === 'turn');

/**
 * Turns a run into lanes. `now` (ms on the run's clock) stretches the open
 * state while the run is live.
 */
export function buildLanes(timeline: RunTimeline, events: LoggedEvent[], now?: number): Lanes {
  const shift = timeline.alignAt ?? timeline.clips[0]?.start ?? 0;
  const lastMark = timeline.states[timeline.states.length - 1]?.at ?? 0;
  const end = timeline.endAt ?? Math.max(now ?? lastMark, lastMark);
  const at = (ms: number) => ms - shift;

  const intervals = timeline.states.map((mark, i) => ({
    state: mark.state,
    start: mark.at,
    end: timeline.states[i + 1]?.at ?? end,
  }));
  const spansOf = (state: string) =>
    intervals.filter((iv) => iv.state === state && iv.end > iv.start).map((iv) => ({ start: at(iv.start), end: at(iv.end) }));

  const stalls = intervals
    .filter((iv, i) => iv.state === 'listening' && intervals[i - 1]?.state === 'speaking' && intervals[i + 1]?.state === 'speaking')
    .map((iv) => ({ start: at(iv.start), end: at(iv.end) }));

  // The agent's clock, moved onto the run's: seconds since 1970 → ms from t0.
  const skew = timeline.skewMs;
  const fromAgent = (seconds: number) => Math.round(seconds * 1000 - (skew ?? 0) - timeline.t0Epoch);
  const turns = turnsOf(events);

  const replies: SpeechSpan[] = [];
  const heard: Lanes['heard'] = [];
  if (skew !== null) {
    for (const turn of turns) {
      const started = turn.metrics.started_speaking_at;
      const stopped = turn.metrics.stopped_speaking_at;
      if (started == null || stopped == null) continue;
      const span = { start: at(fromAgent(started)), end: at(fromAgent(stopped)) };
      if (turn.role === 'assistant') replies.push({ ...span, interrupted: turn.interrupted, text: turn.text, exact: true });
      else heard.push({ ...span, text: turn.text });
    }
  }

  // What the page saw Juniper say is what a listener heard: when a reply is
  // cut off, the agent pauses it first and reports it stopped only once it
  // gives up the turn, about a second later. So the capsules follow the state
  // changes, and the agent's turns say which one was cut off and what it said.
  const speaking: SpeechSpan[] = spansOf('speaking').map((span) => ({ ...span, interrupted: false, text: '', exact: false }));
  const SLACK = 800;
  for (const reply of replies) {
    const parts = speaking.filter((s) => s.start >= reply.start - SLACK && s.start < reply.end);
    if (parts.length === 0) {
      // Its state changes never reached the page: draw it from the agent's own times.
      speaking.push(reply);
      continue;
    }
    parts.forEach((part) => {
      part.exact = true;
      part.text = reply.text;
    });
    // A reply can stop and start again (Experiment 2's stalls); the cut comes at its last part.
    if (reply.interrupted) parts[parts.length - 1].interrupted = true;
  }
  speaking.sort((a, b) => a.start - b.start);

  return {
    clips: timeline.clips.map((c) => ({ ...c, start: at(c.start), end: at(c.end) })),
    speaking,
    thinking: spansOf('thinking'),
    stalls,
    heard,
    end: at(end),
  };
}

/** One time axis for several runs: where it starts (ms, from the alignment point) and how long it spans. */
export function axisFor(runs: Lanes[], minSeconds: number): { origin: number; span: number } {
  const starts = runs.flatMap((lanes) => lanes.clips.map((c) => c.start));
  const origin = Math.min(0, ...starts) - 500;
  const latest = Math.max(
    0,
    ...runs.map((lanes) => lanes.end),
    ...runs.flatMap((lanes) => lanes.speaking.map((s) => s.end)),
    ...runs.flatMap((lanes) => lanes.clips.map((c) => c.end)),
  );
  return { origin, span: Math.max(minSeconds * 1000, latest - origin + 500) };
}

/** The words in each clip, one entry per stretch of speech, for captions under the caller's lane. */
export const CLIP_PHRASES: Partial<Record<ClipKey, string[]>> = {
  tableBooking: ['I’d like a table for…', 'four people on…', 'Friday at seven.'],
  menuQuestion: ['What’s on the menu tonight?'],
  uhHuh: ['uh-huh'],
  vegetarian: ['Wait,', 'do you have anything vegetarian?'],
  cafeBooking: ['Hi, I’d like to book a table for two, tomorrow at eight.'],
  saturday: ['What time do you open on Saturday?'],
};

/** How long each experiment's timeline spans before a long run stretches it, in seconds. */
export const TIMELINE_SECONDS: Record<ExperimentId | 0, number> = { 0: 13, 1: 13, 2: 22, 3: 20, 4: 10 };

/** Stretches of sound in a clip, in seconds, from its peaks: what a listener hears as words. */
export function speechRuns(values: number[], step: number, threshold = 0.06, minGap = 0.25): Span[] {
  const runs: Span[] = [];
  let open: number | null = null;
  values.forEach((v, i) => {
    if (v > threshold && open === null) open = i;
    if (v <= threshold && open !== null) {
      runs.push({ start: open * step, end: i * step });
      open = null;
    }
  });
  if (open !== null) runs.push({ start: open * step, end: values.length * step });
  const merged: Span[] = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run.start - prev.end < minGap) prev.end = run.end;
    else merged.push({ ...run });
  }
  return merged;
}
