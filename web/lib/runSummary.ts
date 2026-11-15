// What one test-caller run showed: the facts, and the sentence that states them.
// The lab's result cards and the overview's replay both read a run through here,
// so a live run and a recording are described in the same words. Pure, so
// `node --test` can run it.

import { CAFE_BOOKING_LINE, type ExperimentId } from './experiments.ts';
import type { LoggedEvent, LoggedTurn } from './protocol';

const turnsOf = (events: LoggedEvent[]) => events.filter((e): e is LoggedTurn => e.type === 'turn');

/** A line's words, lower-cased. Either kind of apostrophe keeps "I'd" as one word. */
export const words = (text: string) => text.toLowerCase().replace(/’/g, "'").match(/[a-z0-9']+/g) ?? [];

const BOOKING = new Set(words(CAFE_BOOKING_LINE));

/** The words in a caller's line that aren't in Experiment 3's booking: the café said them. */
export const extraWords = (text: string) => words(text).filter((word) => !BOOKING.has(word));

/** Juniper's first answer in a run, and the caller's turn just before it. */
export function firstExchange(turns: LoggedTurn[]) {
  const i = turns.findIndex((t) => t.role === 'assistant');
  if (i === -1) return null;
  const user = [...turns.slice(0, i)].reverse().find((t) => t.role === 'user') ?? null;
  return { user, assistant: turns[i] };
}

/** The parts of the pause before an answer, in the order they happen. */
export const PAUSE_PARTS = [
  { label: 'End of turn', from: 'user', key: 'end_of_turn_delay' },
  { label: 'Transcript', from: 'user', key: 'transcription_delay' },
  { label: 'LLM first words', from: 'assistant', key: 'llm_node_ttft' },
  { label: 'Voice starts', from: 'assistant', key: 'tts_node_ttfb' },
  { label: 'Total pause', from: 'assistant', key: 'e2e_latency' },
] as const;

/** Each part of the pause in each run's first exchange, in seconds; null where LiveKit sent no figure. */
export function pauseRows(runs: LoggedTurn[][]) {
  return PAUSE_PARTS.map((part) => ({
    ...part,
    values: runs.map((turns) => {
      const exchange = firstExchange(turns);
      const turn = part.from === 'user' ? exchange?.user : exchange?.assistant;
      return turn?.metrics[part.key] ?? null;
    }),
  }));
}

/** The facts one run showed, by experiment. */
export type RunOutcome =
  | {
      experiment: 1;
      /** What the caller had said by the time Juniper first answered; empty when nothing was heard. */
      heardFirst: string;
      replies: number;
      cutOff: number;
    }
  | {
      experiment: 2;
      /** Times Juniper stopped for something other than the real question. */
      stops: number;
      /** How many of those it picked its sentence back up after. */
      resumed: number;
      heardQuestion: boolean;
    }
  | {
      experiment: 3;
      /** Everything the caller's turns say, as the agent heard it. */
      heard: string;
      /** The words in it that nobody said to the agent. */
      extra: string[];
    }
  | {
      experiment: 4;
      answered: boolean;
      /** LiveKit's timing for Juniper's first answer, in seconds. */
      pause: number | null;
      llm: number | null;
    };

export function runOutcome(experiment: ExperimentId, events: LoggedEvent[]): RunOutcome {
  const turns = turnsOf(events);
  const callerTurns = turns.filter((t) => t.role === 'user');

  if (experiment === 1) {
    // What the caller had said by the time Juniper first answered, and how
    // often Juniper started talking and got talked over.
    const firstReply = turns.findIndex((t) => t.role === 'assistant');
    const heardFirst = (firstReply === -1 ? turns : turns.slice(0, firstReply))
      .filter((t) => t.role === 'user')
      .map((t) => t.text.trim())
      .join(' ');
    const replies = turns.filter((t) => t.role === 'assistant');
    return { experiment, heardFirst, replies: replies.length, cutOff: replies.filter((t) => t.interrupted).length };
  }

  if (experiment === 2) {
    // Count the times Juniper stopped for something other than the real
    // question. Deepgram writes no words for "uh-huh", so the agent treats the
    // stop as a false interruption and picks its sentence back up: those stops
    // arrive as false_interruption events. A stop that did turn into a caller's
    // turn shows as a cut-off reply followed by something other than the question.
    const isRealQuestion = (text: string) => /vegetarian|\bwait\b/i.test(text);
    const resumed = events.filter((e) => e.type === 'false_interruption').length;
    let fullStops = 0;
    turns.forEach((turn, i) => {
      if (turn.role !== 'assistant' || !turn.interrupted) return;
      const next = turns.slice(i + 1).find((t) => t.role === 'user');
      if (next && !isRealQuestion(next.text)) fullStops += 1;
    });
    return {
      experiment,
      stops: resumed + fullStops,
      resumed,
      heardQuestion: callerTurns.some((t) => /vegetarian/i.test(t.text)),
    };
  }

  if (experiment === 3) {
    // Words in the caller's turns that aren't in the booking came from the café.
    const heard = callerTurns
      .map((t) => t.text.trim())
      .filter(Boolean)
      .join(' ');
    return { experiment, heard, extra: extraWords(heard) };
  }

  // Experiment 4: LiveKit's own timing for Juniper's first answer in the run.
  const answer = turns.find((t) => t.role === 'assistant');
  return {
    experiment,
    answered: answer !== undefined,
    pause: answer?.metrics.e2e_latency ?? null,
    llm: answer?.metrics.llm_node_ttft ?? null,
  };
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** True when the run has nothing to report: the caller wasn't heard, or no answer or timing came back. */
export function outcomeIsEmpty(outcome: RunOutcome): boolean {
  if (outcome.experiment === 1) return !outcome.heardFirst;
  if (outcome.experiment === 3) return !outcome.heard;
  if (outcome.experiment === 4) return !outcome.answered || outcome.pause === null || outcome.llm === null;
  return false;
}

/** The outcome in a sentence or two, the same wherever the run is shown. */
export function outcomeSentence(outcome: RunOutcome): string {
  if (outcome.experiment === 1) {
    const { heardFirst, replies, cutOff } = outcome;
    if (!heardFirst) return 'Juniper didn’t hear the caller.';
    if (replies === 0) return `Juniper heard “${heardFirst}” and didn’t answer.`;
    // The quote sits mid-sentence and keeps its own punctuation: a line cut short has no full stop to show.
    return `Juniper heard “${heardFirst}” before its first answer. It started answering ${times(replies)} and was ${
      cutOff > 0 ? `cut off ${times(cutOff)}` : 'never cut off'
    }.`;
  }

  if (outcome.experiment === 2) {
    const { stops, resumed, heardQuestion } = outcome;
    const question = `Heard the real question: ${heardQuestion ? 'yes' : 'no'}.`;
    if (stops === 0) return `Juniper never stopped for “uh-huh”. ${question}`;
    const pickedUp =
      resumed === 0
        ? ''
        : resumed < stops
          ? `, and picked up again ${times(resumed)}`
          : `, and picked up again after a pause${stops === 1 ? '' : ' each time'}`;
    return `Juniper stopped for “uh-huh” ${times(stops)}${pickedUp}. ${question}`;
  }

  if (outcome.experiment === 3) {
    const { heard, extra } = outcome;
    if (!heard) return 'Juniper didn’t hear the caller.';
    if (extra.length === 0) return 'Juniper heard only the caller.';
    // The full stop comes after the closing quote: it isn't one of the words.
    return `Juniper heard ${extra.length} ${extra.length === 1 ? 'word' : 'words'} nobody said to it: “${extra.join(' ')}”.`;
  }

  const { answered, pause, llm } = outcome;
  if (!answered) return 'Juniper didn’t answer.';
  if (pause === null || llm === null) return 'Juniper answered, but no timing came back for that turn.';
  return `The pause before Juniper’s answer was ${pause.toFixed(2)} s. The LLM’s first words took ${llm.toFixed(2)} s of it.`;
}
