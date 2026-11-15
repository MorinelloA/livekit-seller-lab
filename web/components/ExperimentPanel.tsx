'use client';

import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationTimeline, type TimelineRun, TimelineLegend } from '@/components/ConversationTimeline';
import { PauseParts } from '@/components/PauseParts';
import { Prediction } from '@/components/Prediction';
import { TurnList } from '@/components/TurnList';
import { brandCase, Callout, Eyebrow, Segmented } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { DEFAULT_MODE_LABELS, type Experiment, type ExperimentId } from '@/lib/experiments';
import { withBase } from '@/lib/paths';
import type { Peaks } from '@/lib/peaks';
import { isTurn, type LoggedEvent, type Mode } from '@/lib/protocol';
import { loadRecording, RECORDED, type Recording } from '@/lib/recordings';
import { capturedDate, playheadMs, recordedTimeline, recordingName, type ReplayRun } from '@/lib/replay';
import { outcomeIsEmpty, outcomeSentence, runOutcome } from '@/lib/runSummary';
import { type ClipKey, type RunTimeline, TIMELINE_SECONDS } from '@/lib/timeline';
import { inProgress, type PlayerStatus, usePlaybackPosition, useRecordingPlayer } from '@/lib/useRecordingPlayer';

export interface RunState {
  id: string;
  status: 'running' | 'done' | 'failed';
}

export interface RunView {
  state?: RunState;
  events: LoggedEvent[];
  timeline?: RunTimeline;
  /** Set when this is a recording of an earlier call, not a run on this one: when it was made, and its clips' peaks. */
  recorded?: { capturedAt: string; peaks: Partial<Record<ClipKey, Peaks>> };
}

/** How a recorded run came to count: heard to the end, opened without sound, or it didn't load. */
export type RecordedStatus = 'played' | 'skipped' | 'failed';

const MODES: Mode[] = ['baseline', 'enhanced'];

/** "Experiment 1: Knowing when you're done" → "Knowing when you're done". */
const headline = (title: string) => title.replace(/^Experiment \d+:\s*/, '');

type StepState = 'done' | 'current' | 'upcoming';

function Step({ n, state, label, note, children }: { n: number; state: StepState; label: string; note?: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 border-t border-line px-5 py-6 sm:px-7">
      <span
        aria-hidden
        className={cx(
          'mt-[-3px] flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold',
          state === 'done' && 'bg-accent text-on-accent',
          state === 'current' && 'border-[1.5px] border-accent text-accent',
          state === 'upcoming' && 'border-[1.5px] border-line text-subtle',
        )}
      >
        {state === 'done' ? <Icon name="check" className="size-3.5" strokeWidth={2} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="eyebrow-sm text-subtle">
            Step {n} · {label}
          </span>
          {note && <span className="font-mono text-xs text-subtle">{note}</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

export function ExperimentPanel(props: {
  experiment: Experiment;
  currentMode: Mode;
  runs: Record<Mode, RunView>;
  canRun: boolean;
  onRun: (mode: Mode) => void;
  onSetMode: (mode: Mode) => void;
  /** Called once, when the learner locks in a prediction. */
  onPredict?: (choice: string, correct: boolean) => void;
  /** Experiment 3 only: the café under the learner's microphone. */
  cafe?: { on: boolean; onToggle: () => void };
  /** True while a call is joining or connected. Recordings are put away then: the call would hear them. */
  onCall: boolean;
  /** The recorded runs the learner has finished, by hearing them to the end or opening them without sound. */
  recordedDone: Record<Mode, boolean>;
  onRecorded: (mode: Mode, status: RecordedStatus) => void;
}) {
  const { experiment, currentMode, runs, canRun, cafe, onCall, recordedDone } = props;
  const [choice, setChoice] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // "Show the answer now" goes away when the answer opens, so focus moves to the answer.
  const answerRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  const labels = experiment.modeLabels ?? DEFAULT_MODE_LABELS;
  const { prediction, card } = experiment;

  // The recorded runs: a real take of this experiment on each setting, for a
  // learner who isn't on a call. The sound comes from the site's one player;
  // the run's data (timeline, turns, peaks) loads the first time it's asked for.
  const player = useRecordingPlayer();
  const [recording, setRecording] = useState<Recording | null>(null);
  // The setting whose data didn't load, or 'both' when the results were asked for without sound.
  const [dataFailed, setDataFailed] = useState<Mode | 'both' | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const keyOf = (mode: Mode) => recordingName(experiment.id, mode);
  /** Which of this experiment's recordings the player holds, if either. */
  const heldMode = MODES.find((mode) => player.key === keyOf(mode)) ?? null;
  const playback: PlayerStatus = heldMode ? player.status : 'idle';
  const hearing = heldMode !== null && inProgress(playback) ? heldMode : null;

  const liveDone = (mode: Mode) => runs[mode].state?.status === 'done';
  // The parent hears about a finished recording a moment after its sound ends; until then the player's own word counts.
  const recordingDone = (mode: Mode) => recordedDone[mode] || (heldMode === mode && playback === 'ended');
  const doneFor = (mode: Mode) => liveDone(mode) || recordingDone(mode);

  // A recording counts once its sound has ended. The parent keeps the tally and notes it for the pilot.
  const onRecordedRef = useRef(props.onRecorded);
  useEffect(() => {
    onRecordedRef.current = props.onRecorded;
  });
  useEffect(() => {
    if (!heldMode) return;
    if (playback === 'ended') onRecordedRef.current(heldMode, 'played');
    if (playback === 'error') onRecordedRef.current(heldMode, 'failed');
  }, [heldMode, playback]);

  const loadData = useCallback(async () => {
    const loaded = await loadRecording(experiment.id);
    setRecording(loaded);
  }, [experiment.id]);

  const playRecorded = (mode: Mode) => {
    const key = keyOf(mode);
    if (heldMode === mode && inProgress(playback)) {
      if (playback === 'paused') player.resume();
      else player.pause();
      return;
    }
    setDataFailed(null);
    // The sound starts inside the click, as browsers require; the run's data loads alongside it.
    player.play(key, withBase(`/replay/${key}.wav`));
    if (!recording) {
      loadData().catch(() => {
        player.stop(key);
        setDataFailed(mode);
      });
    }
  };

  /** Opens every result that isn't in yet, silently: Step 4 never depends on sound working. */
  const showWithoutSound = () => {
    const missing = MODES.filter((mode) => !doneFor(mode));
    setDataFailed(null);
    if (hearing) player.stop(keyOf(hearing));
    loadData().then(
      () => {
        missing.forEach((mode) => props.onRecorded(mode, 'skipped'));
        // The control goes away once the results are in, so focus moves to them.
        requestAnimationFrame(() => resultsRef.current?.focus());
      },
      () => setDataFailed('both'),
    );
  };

  /** What a setting's card and lane show: this call's run, or else its recording once that's been opened. */
  const viewOf = (mode: Mode): RunView => {
    const live = runs[mode];
    const opened = recording !== null && (recordingDone(mode) || hearing === mode);
    // A run on this call wins over a recording of the same setting, unless it failed.
    if (!opened || (live.state && live.state.status !== 'failed')) return live;
    const run = recording[mode];
    return {
      state: { id: `recorded-${keyOf(mode)}`, status: recordingDone(mode) ? 'done' : 'running' },
      events: run.events,
      timeline: recordedTimeline(run),
      recorded: { capturedAt: run.capturedAt, peaks: run.peaks },
    };
  };
  const views: Record<Mode, RunView> = { baseline: viewOf('baseline'), enhanced: viewOf('enhanced') };
  const labelOf = (mode: Mode) => {
    const made = views[mode].recorded?.capturedAt;
    return made ? `${labels[mode]} · recorded ${capturedDate(made)}` : labels[mode];
  };
  // A recording brings its clips' peaks, so the page never fetches the clips just to draw them.
  const recordedPeaks = useMemo(() => (recording ? { ...recording.baseline.peaks, ...recording.enhanced.peaks } : undefined), [recording]);
  const anyRecorded = MODES.some((mode) => views[mode].recorded);
  /** The recording being heard, when its lane is on the timeline: the playhead follows it. */
  const heard = hearing && recording && views[hearing].recorded ? { key: keyOf(hearing), run: recording[hearing] } : null;

  const bothRan = MODES.every(doneFor);
  const anyRunning = MODES.some((mode) => runs[mode].state?.status === 'running');
  const showAnswer = locked && (revealed || bothRan);
  const liveCount = MODES.filter(liveDone).length;
  const stepNote = bothRan
    ? liveCount === 2
      ? 'Both runs done'
      : liveCount === 1
        ? 'One run and one recording done'
        : 'Both recordings done'
    : anyRunning
      ? 'The test caller is on the line'
      : hearing
        ? playback === 'paused'
          ? 'A recording is paused'
          : 'A recording is playing'
        : undefined;

  // Recordings are offered for the settings that have no finished run on this call.
  const offered = RECORDED.includes(experiment.id) && !onCall ? MODES.filter((mode) => !liveDone(mode)) : [];
  const unseen = offered.filter((mode) => !recordingDone(mode));
  const failedMode = heldMode && player.problem === 'failed' ? heldMode : dataFailed;

  const timelineRuns: TimelineRun[] = MODES.flatMap((mode) => {
    const view = views[mode];
    return view.timeline && view.state
      ? [{ key: view.state.id, label: labelOf(mode), tone: mode, timeline: view.timeline, events: view.events }]
      : [];
  });
  // A recording's turns wait for its end, so the learner hears the run before reading it.
  const turnsFor = (mode: Mode) => (views[mode].recorded && views[mode].state?.status !== 'done' ? [] : views[mode].events.filter(isTurn));

  return (
    <section
      id={`experiment-${experiment.id}`}
      aria-labelledby={`experiment-${experiment.id}-title`}
      className="scroll-mt-6 rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-col gap-3.5 px-5 pt-7 pb-6 sm:px-7">
        <Eyebrow tone="accent" size="sm">
          Experiment {experiment.id} · {experiment.switchName}
        </Eyebrow>
        <h2 id={`experiment-${experiment.id}-title`} className="display text-heading leading-heading">
          {headline(experiment.title)}
        </h2>
        <p className="max-w-[680px] text-base leading-reading">{experiment.lead}</p>
        <dl className="mt-1.5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
          {MODES.map((mode) => (
            <div key={mode} className="flex flex-col gap-1 bg-page px-4 py-3">
              <dt className={cx('eyebrow-sm', mode === 'enhanced' ? 'text-accent' : 'text-subtle')}>{labels[mode]}</dt>
              <dd className="m-0 text-sm leading-normal text-fg">{experiment.settings[mode]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="m-0 list-none p-0">
        <Step n={1} state={locked ? 'done' : 'current'} label="Predict" note={locked ? 'Locked in' : undefined}>
          <Prediction
            name={`experiment-${experiment.id}`}
            question={prediction.question}
            options={prediction.options}
            choice={choice}
            locked={locked}
            onChoose={setChoice}
            onLock={() => {
              setLocked(true);
              if (choice !== null) props.onPredict?.(prediction.options[choice], choice === prediction.expected);
            }}
          />
        </Step>

        <Step
          n={2}
          state={bothRan ? 'done' : locked ? 'current' : 'upcoming'}
          label="Run the test caller"
          note={stepNote}
        >
          <p className="m-0 text-card leading-relaxed">{experiment.testCaller}</p>
          <div className="flex flex-wrap gap-2">
            {MODES.map((mode) => (
              <Button key={mode} size="stack" onClick={() => props.onRun(mode)} disabled={!canRun || !locked}>
                <Icon name="play" className="size-3" />
                Play test caller: {labels[mode]}
              </Button>
            ))}
          </div>

          {offered.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-small leading-normal">
                <span className="font-semibold text-fg">Not on a call? </span>
                Play a recording instead: the same test caller on a real call, recorded earlier.
              </p>
              <div className="flex flex-wrap gap-2">
                {offered.map((mode) => {
                  const paused = heldMode === mode && playback === 'paused';
                  const going = hearing === mode && !paused;
                  return (
                    <Button key={mode} size="stack" onClick={() => playRecorded(mode)} disabled={!locked}>
                      <Icon name={going ? 'pause' : 'play'} className="size-3" />
                      {going ? 'Pause' : paused ? 'Resume' : 'Play'} the recorded {labels[mode]} run
                    </Button>
                  );
                })}
              </div>
              {heldMode && player.problem === 'blocked' && (
                <p className="m-0 text-small text-warn">Your browser didn’t start the sound. Press Play again.</p>
              )}
              {failedMode && (
                <Callout>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="min-w-0 flex-[1_1_16rem]">
                      {failedMode === 'both'
                        ? 'The recordings didn’t load. Check your connection, then try again.'
                        : `The recording of the ${labels[failedMode]} run didn’t load. Check your connection, then try again.`}
                    </span>
                    <Button size="sm" onClick={() => (failedMode === 'both' ? showWithoutSound() : playRecorded(failedMode))}>
                      Retry
                    </Button>
                  </div>
                </Callout>
              )}
              {locked && unseen.length > 0 && (
                <div>
                  <Button variant="quiet" onClick={showWithoutSound}>
                    {unseen.length === 2 ? 'Show both results without sound' : `Show the ${labels[unseen[0]]} result without sound`}
                  </Button>
                </div>
              )}
            </div>
          )}
          {!locked && <p className="m-0 text-small text-subtle">Lock in a prediction first.</p>}

          {timelineRuns.length > 0 && (
            <div className="rounded-md border border-line bg-page">
              <div className="overflow-hidden px-4 pt-4 pb-1.5 sm:px-[18px]">
                <RunsTimeline
                  runs={timelineRuns}
                  minSeconds={TIMELINE_SECONDS[experiment.id]}
                  showOverlap={experiment.id === 1}
                  peaks={anyRecorded ? recordedPeaks : undefined}
                  heard={heard}
                  callerFrom={hearing && heard ? views[hearing].state?.id : undefined}
                  title={`Experiment ${experiment.id}, both settings on one time axis`}
                />
              </div>
              <div className="px-4 pt-1.5 pb-4 sm:px-[18px]">
                <TimelineLegend overlap={experiment.id === 1} stalls={experiment.id === 2} />
              </div>
            </div>
          )}

          <div ref={resultsRef} tabIndex={-1} className="grid gap-3 focus:outline-none md:grid-cols-2">
            {MODES.map((mode) => (
              <RunResult
                key={mode}
                experimentId={experiment.id}
                label={labelOf(mode)}
                tone={mode}
                view={views[mode]}
                playback={heldMode === mode ? playback : 'idle'}
                blocked={heldMode === mode && player.problem === 'blocked'}
              />
            ))}
          </div>

          {experiment.id === 4 && (turnsFor('baseline').length > 0 || turnsFor('enhanced').length > 0) && (
            <PauseParts
              runs={MODES.map((mode) => ({ label: labels[mode], tone: mode, turns: turnsFor(mode) }))}
            />
          )}
        </Step>

        <Step n={3} state={bothRan ? 'current' : 'upcoming'} label="Try it yourself">
          <p className="m-0 text-card leading-relaxed">
            {experiment.tryYourself} Turn on “Use my voice” in the call bar, then pick a setting:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={experiment.switchName}
              options={MODES.map((mode) => ({ value: mode, label: labels[mode] }))}
              // The setting in use stays shown while a run plays; the control is only disabled.
              value={currentMode}
              onChange={props.onSetMode}
              disabled={!canRun}
            />
            {cafe && (
              <Button
                onClick={cafe.onToggle}
                disabled={!canRun}
                className={cafe.on ? 'border-accent-line bg-accent-soft text-accent' : undefined}
              >
                <Icon name="cafe" className="size-4" />
                {cafe.on ? 'Café noise is on' : 'Café noise'}
              </Button>
            )}
          </div>
          <p className="m-0 text-sm leading-relaxed">
            <span className="font-semibold text-fg">Listen for. </span>
            {experiment.listenFor}
          </p>
        </Step>

        <Step n={4} state={showAnswer ? 'done' : 'upcoming'} label="Take it to a call">
          {showAnswer ? (
            <>
              <p ref={answerRef} tabIndex={-1} className="m-0 flex items-start gap-2 text-sm leading-normal text-fg focus:outline-none">
                <Icon
                  name={choice === prediction.expected ? 'check' : 'info'}
                  className={cx('mt-0.5 size-4 shrink-0', choice === prediction.expected ? 'text-ok' : 'text-subtle')}
                />
                <span>
                  <span className="font-semibold">Expected: </span>
                  {prediction.options[prediction.expected]}.{' '}
                  {choice === prediction.expected
                    ? 'That’s what you predicted.'
                    : `You predicted: ${prediction.options[choice ?? 0]}.`}
                </span>
              </p>
              <div className="overflow-hidden rounded-lg border border-accent-line">
                <dl className="m-0 grid gap-px bg-line md:grid-cols-3">
                  <CardPart title="What the customer says" emphasis>
                    {card.customerSays}
                  </CardPart>
                  <CardPart title="What’s actually happening">{card.happening}</CardPart>
                  <CardPart title="What LiveKit does">{card.livekitDoes}</CardPart>
                </dl>
                <div className="flex flex-col gap-2.5 border-t border-accent-line bg-accent-soft px-5 pt-5 pb-6">
                  <Eyebrow tone="accent" size="sm">
                    Ask this
                  </Eyebrow>
                  <p className="display m-0 text-quote leading-[1.35] [text-wrap:pretty]">{card.askThis}</p>
                </div>
              </div>
            </>
          ) : locked ? (
            <div>
              <Button variant="quiet" onClick={() => setRevealed(true)}>
                Show the answer now
              </Button>
            </div>
          ) : (
            <p className="m-0 text-small text-subtle">The answer and the question to ask open once both runs are done.</p>
          )}
        </Step>
      </ol>
    </section>
  );
}

function CardPart({ title, emphasis, children }: { title: string; emphasis?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 bg-surface p-[18px]">
      <dt className="eyebrow-sm text-subtle">{brandCase(title)}</dt>
      <dd className={cx('m-0 text-sm leading-relaxed', emphasis ? 'text-fg' : 'text-body')}>{children}</dd>
    </div>
  );
}

/**
 * The timeline, with a playhead while one of its runs is a recording being
 * heard. The playhead moves every frame, so only this part redraws with it.
 */
function RunsTimeline({
  heard,
  ...timeline
}: Omit<ComponentProps<typeof ConversationTimeline>, 'playheadMs'> & { heard: { key: string; run: ReplayRun } | null }) {
  const position = usePlaybackPosition(heard?.key ?? null);
  return <ConversationTimeline {...timeline} playheadMs={heard && position !== null ? playheadMs(heard.run, position) : null} />;
}

function RunResult({
  experimentId,
  label,
  tone,
  view,
  playback,
  blocked,
}: {
  experimentId: ExperimentId;
  label: string;
  tone: Mode;
  view: RunView;
  /** Where the site's player is with this setting's recording; 'idle' when it holds another, or none. */
  playback: PlayerStatus;
  /** The browser wouldn't start this setting's recording. */
  blocked: boolean;
}) {
  const status = view.state?.status;
  const recorded = view.recorded !== undefined;
  // A recording's turns wait for its end, so the learner hears the run before reading it.
  const turns = recorded && status !== 'done' ? [] : view.events.filter(isTurn);
  const progress =
    playback === 'loading'
      ? 'Loading the recording…'
      : playback === 'buffering'
        ? 'Buffering…'
        : playback === 'paused'
          ? 'The recording is paused.'
          : playback === 'playing'
            ? 'The recording is playing…'
            : null;
  const live = recorded ? undefined : status;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-[18px]">
      <p className={cx('eyebrow-sm m-0', tone === 'enhanced' ? 'text-accent' : 'text-subtle')}>{label}</p>
      {!status && !progress && <p className="m-0 text-sm text-subtle">Not run yet.</p>}
      {live === 'running' && <p className="m-0 text-sm text-subtle">The test caller is on the line…</p>}
      {live === 'failed' && <p className="m-0 text-sm text-warn">This run didn’t finish. Try it again.</p>}
      {/* A recording that's already been heard keeps showing its result while it plays again. */}
      {progress && live === undefined && status !== 'done' && <p className="m-0 text-sm text-subtle">{progress}</p>}
      {/* Only the run's status is announced; its turns are read when the learner gets to them. */}
      <p role="status" className="sr-only">
        {blocked
          ? `${label}: your browser didn’t start the sound. Press Play again.`
          : recorded && status === 'done'
            ? // The same words whether it was heard to the end or opened without sound, and while it plays again: said once.
              `${label}: the result is showing.`
            : playback === 'loading'
              ? `${label}: loading the recording.`
              : playback === 'buffering'
                ? `${label}: the recording is buffering.`
                : live === 'running'
                  ? `${label}: the test caller is on the line.`
                  : live === 'failed'
                    ? `${label}: this run didn’t finish.`
                    : live === 'done'
                      ? `${label}: the run is done.`
                      : ''}
      </p>
      {status === 'done' && <Summary experimentId={experimentId} events={view.events} />}
      {turns.length > 0 && (
        <div className="border-t border-line pt-3">
          <TurnList turns={turns} markExtra={experimentId === 3} />
        </div>
      )}
    </div>
  );
}

/** What the run showed, in the words lib/runSummary.ts gives every run of that kind. */
function Summary({ experimentId, events }: { experimentId: ExperimentId; events: LoggedEvent[] }) {
  const outcome = runOutcome(experimentId, events);
  return (
    <p className={outcomeIsEmpty(outcome) ? 'm-0 text-sm text-subtle' : 'm-0 text-sm leading-relaxed text-fg'}>
      {outcomeSentence(outcome)}
    </p>
  );
}
