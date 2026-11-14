// Run with `pnpm test` (node --test; Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LoggedEvent, TurnMetrics } from './protocol.ts';
import { axisFor, buildLanes, type RunTimeline, speechRuns } from './timeline.ts';

const T0 = 1_800_000_000_000; // the page's Date.now() when the run started

function run(partial: Partial<RunTimeline>): RunTimeline {
  return {
    v: 1,
    experiment: 1,
    mode: 'baseline',
    status: 'done',
    t0Epoch: T0,
    skewMs: 0,
    alignAt: 300,
    endAt: 12_000,
    clips: [{ clip: 'tableBooking', start: 300, end: 8_570 }],
    states: [{ state: 'listening', at: 0 }],
    ...partial,
  };
}

const metrics = (m: Partial<TurnMetrics>): TurnMetrics => ({
  end_of_turn_delay: null,
  transcription_delay: null,
  llm_node_ttft: null,
  tts_node_ttfb: null,
  e2e_latency: null,
  ...m,
});

function turn(role: 'user' | 'assistant', startMs: number, stopMs: number, interrupted = false, skew = 0): LoggedEvent {
  return {
    type: 'turn',
    id: `${role}-${startMs}`,
    role,
    text: role === 'user' ? 'caller words' : 'reply',
    interrupted,
    settings: { turn_detection: 'baseline', interruptions: 'enhanced', noise: 'baseline', model: 'fast' },
    // The agent reports Unix seconds on its own clock.
    metrics: metrics({ started_speaking_at: (T0 + startMs + skew) / 1000, stopped_speaking_at: (T0 + stopMs + skew) / 1000 }),
    createdAt: (T0 + stopMs + skew) / 1000,
    runId: 'r',
    receivedAt: T0 + stopMs + 80,
  };
}

test('places replies by the agent’s own speech times, lined up on the first clip', () => {
  const lanes = buildLanes(run({}), [turn('assistant', 2_500, 3_300, true), turn('assistant', 9_500, 12_000)]);
  assert.deepEqual(
    lanes.speaking.map((s) => [s.start, s.end, s.interrupted, s.exact]),
    [
      [2_200, 3_000, true, true],
      [9_200, 11_700, false, true],
    ],
  );
  assert.equal(lanes.clips[0].start, 0);
});

test('corrects for the agent’s clock running ahead of the page’s', () => {
  const lanes = buildLanes(run({ skewMs: 1_500 }), [turn('assistant', 2_500, 3_300, false, 1_500)]);
  assert.deepEqual([lanes.speaking[0].start, lanes.speaking[0].end], [2_200, 3_000]);
});

test('falls back to the agent’s states when it doesn’t report its clock', () => {
  const states = [
    { state: 'listening', at: 0 },
    { state: 'thinking', at: 1_900 },
    { state: 'speaking', at: 3_100 },
    { state: 'listening', at: 4_200 },
  ];
  const lanes = buildLanes(run({ skewMs: null, states }), [turn('assistant', 2_500, 3_300, true)]);
  assert.deepEqual(lanes.thinking, [{ start: 1_600, end: 2_800 }]);
  assert.deepEqual(
    lanes.speaking.map((s) => [s.start, s.end, s.exact]),
    [[2_800, 3_900, false]],
  );
});

test('shows a reply still being spoken from the states, after the last finished one', () => {
  const states = [
    { state: 'listening', at: 0 },
    { state: 'speaking', at: 2_500 },
    { state: 'listening', at: 3_300 },
    { state: 'speaking', at: 9_500 },
  ];
  const lanes = buildLanes(run({ status: 'running', endAt: null, states }), [turn('assistant', 2_500, 3_300, true)], 10_500);
  assert.equal(lanes.speaking.length, 2);
  assert.deepEqual([lanes.speaking[0].interrupted, lanes.speaking[0].exact], [true, true]);
  assert.deepEqual([lanes.speaking[1].start, lanes.speaking[1].end, lanes.speaking[1].exact], [9_200, 10_200, false]);
});

test('a cut-off reply ends where it went quiet, not where the agent gave up the turn', () => {
  // Measured on 15 Nov 2026: the reply paused at 4.4 s; the agent reported it stopped at 5.6 s.
  const states = [
    { state: 'listening', at: 0 },
    { state: 'thinking', at: 2_612 },
    { state: 'speaking', at: 2_967 },
    { state: 'listening', at: 4_417 },
  ];
  const lanes = buildLanes(run({ alignAt: 320, states }), [turn('assistant', 2_936, 5_646, true)]);
  assert.deepEqual(
    lanes.speaking.map((s) => [s.start, s.end, s.interrupted]),
    [[2_647, 4_097, true]],
  );
});

test('marks the cut on the last part of a reply that stalled first', () => {
  const states = [
    { state: 'listening', at: 0 },
    { state: 'speaking', at: 3_000 },
    { state: 'listening', at: 6_000 },
    { state: 'speaking', at: 8_000 },
    { state: 'listening', at: 11_000 },
  ];
  const lanes = buildLanes(run({ alignAt: 0, states }), [turn('assistant', 3_000, 12_000, true)]);
  assert.deepEqual(
    lanes.speaking.map((s) => s.interrupted),
    [false, true],
  );
  assert.deepEqual(lanes.stalls, [{ start: 6_000, end: 8_000 }]);
});

test('Experiment 2 lines up on the first “uh-huh” and finds the stalls', () => {
  const timeline = run({
    experiment: 2,
    alignAt: 6_000,
    clips: [
      { clip: 'menuQuestion', start: 300, end: 2_070 },
      { clip: 'uhHuh', start: 6_000, end: 6_730 },
    ],
    states: [
      { state: 'listening', at: 0 },
      { state: 'speaking', at: 3_300 },
      { state: 'listening', at: 6_600 },
      { state: 'speaking', at: 8_600 },
    ],
  });
  const lanes = buildLanes(timeline, []);
  assert.equal(lanes.clips[0].start, -5_700);
  assert.deepEqual(lanes.stalls, [{ start: 600, end: 2_600 }]);
  const axis = axisFor([lanes], 22);
  assert.equal(axis.origin, -6_200);
  assert.equal(axis.span, 22_000);
});

test('finds the stretches of speech in a clip, joining short gaps', () => {
  const values = [0, 0.5, 0.6, 0.02, 0.4, 0, 0, 0, 0, 0, 0.9, 0];
  assert.deepEqual(speechRuns(values, 0.25, 0.06, 0.3), [
    { start: 0.25, end: 1.25 },
    { start: 2.5, end: 2.75 },
  ]);
});
