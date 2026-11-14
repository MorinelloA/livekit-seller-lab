'use client';

import { useState } from 'react';
import { Prediction } from '@/components/Prediction';
import { CAFE_BOOKING_LINE, DEFAULT_MODE_LABELS, type Experiment, type ExperimentId } from '@/lib/experiments';
import { isTurn, type LoggedEvent, type LoggedTurn, type Mode } from '@/lib/protocol';

export interface RunState {
  id: string;
  status: 'running' | 'done' | 'failed';
}

export interface RunView {
  state?: RunState;
  events: LoggedEvent[];
}

const MODES: Mode[] = ['baseline', 'enhanced'];

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

  const labels = experiment.modeLabels ?? DEFAULT_MODE_LABELS;
  const bothRan = MODES.every((mode) => runs[mode].state?.status === 'done');
  const showAnswer = locked && (revealed || bothRan);
  const { prediction, card } = experiment;

  return (
    <section className="space-y-6 rounded-2xl border border-stone-200 bg-white p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{experiment.title}</h2>
        <p className="text-stone-600">{experiment.lead}</p>
        <dl className="grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
          {MODES.map((mode) => (
            <div key={mode}>
              <dt className="inline font-medium text-stone-900">{labels[mode]}: </dt>
              <dd className="inline">{experiment.settings[mode]}</dd>
            </div>
          ))}
        </dl>
      </div>

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

      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-semibold">Run it. </span>
          {experiment.testCaller}
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => props.onRun(mode)}
              disabled={!canRun || !locked}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-40"
            >
              Play test caller: {labels[mode]}
            </button>
          ))}
        </div>
        {!locked && <p className="text-xs text-stone-500">Lock in a prediction first.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {MODES.map((mode) => (
            <RunResult key={mode} experimentId={experiment.id} label={labels[mode]} view={runs[mode]} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-semibold">Try it yourself. </span>
          {experiment.tryYourself} Turn on “Use my voice” above, then pick a setting:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-stone-300 p-0.5" role="group" aria-label={experiment.switchName}>
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => props.onSetMode(mode)}
                disabled={!canRun}
                aria-pressed={currentMode === mode}
                className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${
                  currentMode === mode ? 'bg-stone-900 text-white' : 'text-stone-700'
                }`}
              >
                {labels[mode]}
              </button>
            ))}
          </div>
          {cafe && (
            <button
              type="button"
              onClick={cafe.onToggle}
              disabled={!canRun}
              aria-pressed={cafe.on}
              className={`rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-40 ${
                cafe.on ? 'border-accent bg-accent-soft text-accent' : 'border-stone-300 bg-white'
              }`}
            >
              {cafe.on ? 'Café noise is on' : 'Café noise'}
            </button>
          )}
        </div>
        <p className="text-sm text-stone-600">
          <span className="font-semibold text-stone-900">Listen for. </span>
          {experiment.listenFor}
        </p>
      </div>

      {showAnswer ? (
        <div className="space-y-3 rounded-xl border border-accent/30 bg-accent-soft p-4">
          <p className="text-sm">
            <span className="font-semibold">Expected: </span>
            {prediction.options[prediction.expected]}.{' '}
            {choice === prediction.expected
              ? 'That’s what you predicted.'
              : `You predicted: ${prediction.options[choice ?? 0]}.`}
          </p>
          <ul className="space-y-2 text-sm">
            <li><span className="font-semibold">What the customer says: </span>{card.customerSays}</li>
            <li><span className="font-semibold">What’s actually happening: </span>{card.happening}</li>
            <li><span className="font-semibold">What LiveKit does: </span>{card.livekitDoes}</li>
            <li><span className="font-semibold">Ask this: </span>{card.askThis}</li>
          </ul>
        </div>
      ) : (
        locked && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-sm font-medium text-accent underline underline-offset-4"
          >
            Show the answer now
          </button>
        )
      )}
    </section>
  );
}

function RunResult({ experimentId, label, view }: { experimentId: ExperimentId; label: string; view: RunView }) {
  const turns = view.events.filter(isTurn);
  const status = view.state?.status;

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 p-3" aria-live="polite">
      <p className="text-sm font-semibold">{label}</p>
      {!status && <p className="text-sm text-stone-500">Not run yet.</p>}
      {status === 'running' && <p className="text-sm text-stone-500">The test caller is on the line…</p>}
      {status === 'failed' && <p className="text-sm text-amber-700">This run didn’t finish. Try it again.</p>}
      {status === 'done' && <Summary experimentId={experimentId} turns={turns} events={view.events} />}
      <TurnList turns={turns} />
    </div>
  );
}

/** The conversation from one run, with Juniper's cut-off replies marked. */
export function TurnList({ turns }: { turns: LoggedTurn[] }) {
  if (turns.length === 0) return null;
  return (
    <ol className="space-y-1 text-sm">
      {turns.map((turn) => (
        <li key={turn.id} className="leading-snug">
          <span className="font-medium">{turn.role === 'user' ? 'Caller' : (turn.agent ?? 'Juniper')}: </span>
          <span className="text-stone-700">{turn.text || '(nothing heard)'}</span>
          {turn.interrupted && (
            <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">cut off</span>
          )}
        </li>
      ))}
    </ol>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

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
    if (!before) return <p className="text-sm text-stone-500">Juniper didn’t hear the caller.</p>;
    return (
      <p className="text-sm">
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
    if (!heard) return <p className="text-sm text-stone-500">Juniper didn’t hear the caller.</p>;
    return (
      <p className="text-sm">
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
    if (!answer) return <p className="text-sm text-stone-500">Juniper didn’t answer.</p>;
    if (pause == null || llm == null) {
      return <p className="text-sm text-stone-500">Juniper answered, but no timing came back for that turn.</p>;
    }
    return (
      <p className="text-sm">
        The pause before Juniper’s answer was {pause.toFixed(2)} s. The LLM’s first words took {llm.toFixed(2)} s
        of it.
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
    <p className="text-sm">
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
