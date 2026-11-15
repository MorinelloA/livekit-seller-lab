'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ConversationTimeline, type TimelineRun, TimelineLegend } from '@/components/ConversationTimeline';
import { PauseParts } from '@/components/PauseParts';
import { Prediction } from '@/components/Prediction';
import { brandCase, Eyebrow, Segmented } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { CAFE_BOOKING_LINE, DEFAULT_MODE_LABELS, type Experiment, type ExperimentId } from '@/lib/experiments';
import { isTurn, type LoggedEvent, type LoggedTurn, type Mode } from '@/lib/protocol';
import { type RunTimeline, TIMELINE_SECONDS } from '@/lib/timeline';

export interface RunState {
  id: string;
  status: 'running' | 'done' | 'failed';
}

export interface RunView {
  state?: RunState;
  events: LoggedEvent[];
  timeline?: RunTimeline;
}

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
          <span className="eyebrow text-[11px] text-subtle">
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
}) {
  const { experiment, currentMode, runs, canRun, cafe } = props;
  const [choice, setChoice] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // "Show the answer now" goes away when the answer opens, so focus moves to the answer.
  const answerRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  const labels = experiment.modeLabels ?? DEFAULT_MODE_LABELS;
  const bothRan = MODES.every((mode) => runs[mode].state?.status === 'done');
  const anyRunning = MODES.some((mode) => runs[mode].state?.status === 'running');
  const showAnswer = locked && (revealed || bothRan);
  const { prediction, card } = experiment;

  const timelineRuns: TimelineRun[] = MODES.flatMap((mode) => {
    const view = runs[mode];
    return view.timeline && view.state
      ? [{ key: view.state.id, label: labels[mode], tone: mode, timeline: view.timeline, events: view.events }]
      : [];
  });
  const turnsFor = (mode: Mode) => runs[mode].events.filter(isTurn);

  return (
    <section
      id={`experiment-${experiment.id}`}
      aria-labelledby={`experiment-${experiment.id}-title`}
      className="scroll-mt-6 rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-col gap-3.5 px-5 pt-7 pb-6 sm:px-7">
        <Eyebrow tone="accent" className="text-[11px]">
          Experiment {experiment.id} · {experiment.switchName}
        </Eyebrow>
        <h2 id={`experiment-${experiment.id}-title`} className="display text-[30px] leading-[1.15]">
          {headline(experiment.title)}
        </h2>
        <p className="max-w-[680px] text-base leading-[1.7]">{experiment.lead}</p>
        <dl className="mt-1.5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
          {MODES.map((mode) => (
            <div key={mode} className="flex flex-col gap-1 bg-page px-4 py-3">
              <dt className={cx('eyebrow text-[11px]', mode === 'enhanced' ? 'text-accent' : 'text-subtle')}>{labels[mode]}</dt>
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
          note={bothRan ? 'Both runs done' : anyRunning ? 'The test caller is on the line' : undefined}
        >
          <p className="m-0 text-[15px] leading-relaxed">{experiment.testCaller}</p>
          <div className="flex flex-wrap gap-2">
            {MODES.map((mode) => (
              <Button key={mode} onClick={() => props.onRun(mode)} disabled={!canRun || !locked}>
                <Icon name="play" className="size-3" />
                Play test caller: {labels[mode]}
              </Button>
            ))}
          </div>
          {!locked && <p className="m-0 text-[13px] text-subtle">Lock in a prediction first.</p>}

          {timelineRuns.length > 0 && (
            <div className="rounded-md border border-line bg-page">
              <div className="overflow-hidden px-4 pt-4 pb-1.5 sm:px-[18px]">
                <ConversationTimeline
                  runs={timelineRuns}
                  minSeconds={TIMELINE_SECONDS[experiment.id]}
                  showOverlap={experiment.id === 1}
                  title={`Experiment ${experiment.id}, both settings on one time axis`}
                />
              </div>
              <div className="px-4 pt-1.5 pb-4 sm:px-[18px]">
                <TimelineLegend overlap={experiment.id === 1} stalls={experiment.id === 2} />
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {MODES.map((mode) => (
              <RunResult key={mode} experimentId={experiment.id} label={labels[mode]} tone={mode} view={runs[mode]} />
            ))}
          </div>

          {experiment.id === 4 && (turnsFor('baseline').length > 0 || turnsFor('enhanced').length > 0) && (
            <PauseParts
              runs={MODES.map((mode) => ({ label: labels[mode], tone: mode, turns: turnsFor(mode) }))}
            />
          )}
        </Step>

        <Step n={3} state={bothRan ? 'current' : 'upcoming'} label="Try it yourself">
          <p className="m-0 text-[15px] leading-relaxed">
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
                  <Eyebrow tone="accent" className="text-[11px]">
                    Ask this
                  </Eyebrow>
                  <p className="display m-0 text-[clamp(19px,2.1vw,24px)] leading-[1.35] [text-wrap:pretty]">{card.askThis}</p>
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
            <p className="m-0 text-[13px] text-subtle">The answer and the question to ask open once both runs are done.</p>
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

function RunResult({
  experimentId,
  label,
  tone,
  view,
}: {
  experimentId: ExperimentId;
  label: string;
  tone: Mode;
  view: RunView;
}) {
  const turns = view.events.filter(isTurn);
  const status = view.state?.status;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-[18px]">
      <p className={cx('eyebrow m-0 text-[11px]', tone === 'enhanced' ? 'text-accent' : 'text-subtle')}>{label}</p>
      {!status && <p className="m-0 text-sm text-subtle">Not run yet.</p>}
      {status === 'running' && <p className="m-0 text-sm text-subtle">The test caller is on the line…</p>}
      {status === 'failed' && <p className="m-0 text-sm text-warn">This run didn’t finish. Try it again.</p>}
      {/* Only the run's status is announced; its turns are read when the learner gets to them. */}
      <p role="status" className="sr-only">
        {status === 'running'
          ? `${label}: the test caller is on the line.`
          : status === 'failed'
            ? `${label}: this run didn’t finish.`
            : status === 'done'
              ? `${label}: the run is done.`
              : ''}
      </p>
      {status === 'done' && <Summary experimentId={experimentId} turns={turns} events={view.events} />}
      {turns.length > 0 && (
        <div className="border-t border-line pt-3">
          <TurnList turns={turns} markExtra={experimentId === 3} />
        </div>
      )}
    </div>
  );
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A caller's line with the words that aren't in the café booking marked: the café said them. */
function MarkedLine({ text }: { text: string }) {
  const booking = new Set(words(CAFE_BOOKING_LINE));
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const word = part.toLowerCase().match(/[a-z0-9']+/)?.[0];
        return word && !booking.has(word) ? (
          <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-warn">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

/** The conversation from one run, with Juniper's cut-off replies marked. */
export function TurnList({ turns, markExtra = false }: { turns: LoggedTurn[]; markExtra?: boolean }) {
  if (turns.length === 0) return null;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] leading-normal">
      {turns.map((turn) => (
        <li key={turn.id}>
          <span className={cx('font-semibold', turn.role === 'user' ? 'text-fg' : 'text-accent')}>
            {turn.role === 'user' ? 'Caller' : (turn.agent ?? 'Juniper')}:{' '}
          </span>
          <span>
            {!turn.text ? '(nothing heard)' : markExtra && turn.role === 'user' ? <MarkedLine text={turn.text} /> : turn.text}
          </span>
          {turn.interrupted && (
            <span className="ml-1.5 rounded-sm bg-warn-soft px-1.5 font-mono text-[11px] text-warn">cut off</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Summary({
  experimentId,
  turns,
  events,
}: {
  experimentId: ExperimentId;
  turns: LoggedTurn[];
  events: LoggedEvent[];
}) {
  const callerTurns = turns.filter((t) => t.role === 'user');
  const line = 'm-0 text-sm leading-relaxed text-fg';

  if (experimentId === 1) {
    // What the caller had said by the time Juniper first answered, and how
    // often Juniper started talking and got talked over.
    const firstReply = turns.findIndex((t) => t.role === 'assistant');
    const before = (firstReply === -1 ? turns : turns.slice(0, firstReply))
      .filter((t) => t.role === 'user')
      .map((t) => t.text.trim())
      .join(' ');
    const replies = turns.filter((t) => t.role === 'assistant');
    const cutOff = replies.filter((t) => t.interrupted).length;
    if (!before) return <p className="m-0 text-sm text-subtle">Juniper didn’t hear the caller.</p>;
    return (
      <p className={line}>
        Before its first answer, Juniper heard: “{before}” It started answering {replies.length}{' '}
        {replies.length === 1 ? 'time' : 'times'}
        {cutOff > 0 ? ` and was cut off ${cutOff} ${cutOff === 1 ? 'time' : 'times'}.` : ' and was never cut off.'}
      </p>
    );
  }

  if (experimentId === 3) {
    // Words in the caller's turns that aren't in the booking came from the café.
    const booking = new Set(words(CAFE_BOOKING_LINE));
    const heard = callerTurns.map((t) => t.text.trim()).join(' ');
    const extra = words(heard).filter((w) => !booking.has(w));
    if (!heard) return <p className="m-0 text-sm text-subtle">Juniper didn’t hear the caller.</p>;
    return (
      <p className={line}>
        {extra.length === 0
          ? 'Juniper heard only the caller.'
          : `Juniper heard ${plural(extra.length, 'word')} nobody said to it: “${extra.join(' ')}.”`}
      </p>
    );
  }

  if (experimentId === 4) {
    // LiveKit's own timing for Juniper's first answer in the run.
    const answer = turns.find((t) => t.role === 'assistant');
    const pause = answer?.metrics.e2e_latency;
    const llm = answer?.metrics.llm_node_ttft;
    if (!answer) return <p className="m-0 text-sm text-subtle">Juniper didn’t answer.</p>;
    if (pause == null || llm == null) {
      return <p className="m-0 text-sm text-subtle">Juniper answered, but no timing came back for that turn.</p>;
    }
    return (
      <p className={line}>
        The pause before Juniper’s answer was {pause.toFixed(2)} s. The LLM’s first words took {llm.toFixed(2)} s of it.
      </p>
    );
  }

  // Experiment 2. Count the times Juniper stopped for something other than the
  // real question. Deepgram writes no words for "uh-huh", so the agent treats
  // the stop as a false interruption and picks its sentence back up: those
  // stops arrive as false_interruption events. A stop that did turn into a
  // caller's turn shows as a cut-off reply followed by something other than
  // the question.
  const isRealQuestion = (text: string) => /vegetarian|\bwait\b/i.test(text);
  const stalls = events.filter((e) => e.type === 'false_interruption').length;
  let fullStops = 0;
  turns.forEach((turn, i) => {
    if (turn.role !== 'assistant' || !turn.interrupted) return;
    const next = turns.slice(i + 1).find((t) => t.role === 'user');
    if (next && !isRealQuestion(next.text)) fullStops += 1;
  });
  const stops = stalls + fullStops;
  const heardQuestion = callerTurns.some((t) => /vegetarian/i.test(t.text));
  return (
    <p className={line}>
      Juniper stopped for “uh-huh” {stops} {stops === 1 ? 'time' : 'times'}
      {stalls > 0
        ? stalls === stops
          ? ', and picked up again after a pause each time'
          : `, and picked up again ${stalls === 1 ? 'once' : `${stalls} times`}`
        : ''}
      . Heard the real question: {heardQuestion ? 'yes' : 'no'}.
    </p>
  );
}
