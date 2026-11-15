// Run with `pnpm test`. Every recorded run the site plays (lib/recordings.ts) is checked here:
// its files are in place, it can back up its summary and its figure, and it still shows
// the experiment's lesson. A take recorded again has to pass before it ships.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ExperimentId } from './experiments.ts';
import type { Mode } from './protocol.ts';
import { RECORDED } from './recordings.ts';
import { captureProblems, recordedTimeline, recordingName, type ReplayRun } from './replay.ts';
import { type RunOutcome, runOutcome } from './runSummary.ts';

const WEB = join(import.meta.dirname, '..');
const MODES: Mode[] = ['baseline', 'enhanced'];

const read = (experiment: ExperimentId, mode: Mode) =>
  JSON.parse(readFileSync(join(WEB, 'lib', 'replays', `${recordingName(experiment, mode)}.json`), 'utf8')) as ReplayRun;

/** A run's outcome, narrowed to its experiment's kind. */
function outcome<N extends ExperimentId>(experiment: N, mode: Mode) {
  return runOutcome(experiment, read(experiment, mode).events) as Extract<RunOutcome, { experiment: N }>;
}

test('every experiment has a recording', () => {
  assert.deepEqual(RECORDED, [1, 2, 3, 4]);
});

for (const experiment of RECORDED) {
  for (const mode of MODES) {
    const name = recordingName(experiment, mode);

    test(`${name}: the take is the one its name says, and it can back up its summary and figure`, () => {
      const run = read(experiment, mode);
      assert.equal(run.timeline.experiment, experiment);
      assert.equal(run.timeline.mode, mode);
      assert.deepEqual(captureProblems(experiment, mode, run), []);
      assert.ok(!Number.isNaN(Date.parse(run.capturedAt)), 'capturedAt is a date');
      // Its peaks cover every clip it played, so no page fetches a clip to draw it.
      for (const clip of run.timeline.clips) assert.ok(run.peaks[clip.clip], `peaks for ${clip.clip}`);
    });

    test(`${name}: the recording is a 24 kHz mono WAV of the length the take gives`, () => {
      const run = read(experiment, mode);
      // The pages build the sound's address from the name, before the take's data has loaded.
      assert.equal(run.audio?.src, `/replay/${name}.wav`);
      const path = join(WEB, 'public', 'replay', `${name}.wav`);
      assert.ok(existsSync(path), `${name}.wav is in public/replay`);
      const wav = readFileSync(path);
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
      assert.equal(wav.readUInt16LE(20), 1, 'PCM');
      assert.equal(wav.readUInt16LE(22), 1, 'mono');
      assert.equal(wav.readUInt32LE(24), 24_000, '24 kHz');
      assert.equal(wav.readUInt16LE(34), 16, '16-bit');
      assert.equal(wav.readUInt32LE(40), wav.length - 44, 'the header gives the data’s real length');
      const seconds = (wav.length - 44) / 2 / 24_000;
      assert.ok(Math.abs(seconds * 1000 - (run.audio?.durationMs ?? 0)) <= 1, 'durationMs matches the WAV');
      // Trimmed: the figure ends with the sound, and nothing Juniper said is past the end.
      const lastSpeech = Math.max(...run.timeline.states.map((s) => s.at));
      assert.ok((run.audio?.offsetMs ?? 0) + (run.audio?.durationMs ?? 0) >= lastSpeech, 'the sound runs to the last state change');
      assert.ok((recordedTimeline(run).endAt ?? 0) <= (run.timeline.endAt ?? 0));
    });
  }
}

test('Experiment 1 still shows its lesson: Baseline answers at the pauses, Enhanced once', () => {
  assert.ok(outcome(1, 'baseline').replies >= 2);
  assert.ok(outcome(1, 'baseline').cutOff >= 1);
  assert.equal(outcome(1, 'enhanced').replies, 1);
  assert.equal(outcome(1, 'enhanced').cutOff, 0);
});

test('Experiment 2 still shows its lesson: Baseline stops for "uh-huh", Enhanced doesn’t, both hear the question', () => {
  assert.ok(outcome(2, 'baseline').stops >= 1);
  assert.equal(outcome(2, 'enhanced').stops, 0);
  assert.equal(outcome(2, 'baseline').heardQuestion, true);
  assert.equal(outcome(2, 'enhanced').heardQuestion, true);
});

test('Experiment 3 still shows its lesson: Baseline hears the café, Enhanced only the caller', () => {
  assert.ok(outcome(3, 'baseline').extra.length > 0);
  assert.notEqual(outcome(3, 'enhanced').heard, '');
  assert.deepEqual(outcome(3, 'enhanced').extra, []);
});

test('Experiment 4 still shows its lesson: the reasoning model’s first words take longer, and so does the pause', () => {
  const fast = outcome(4, 'baseline');
  const reasoning = outcome(4, 'enhanced');
  assert.ok(fast.llm !== null && reasoning.llm !== null && reasoning.llm > fast.llm);
  assert.ok(fast.pause !== null && reasoning.pause !== null && reasoning.pause > fast.pause);
});
