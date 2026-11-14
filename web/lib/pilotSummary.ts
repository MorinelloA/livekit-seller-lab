import { checkScore } from '@/lib/check';
import type { Step, StoredEvent, TranscriptLine } from '@/lib/pilot';
import type { Scorecard } from '@/lib/practice';

// Turns a participant's stored events into what the pilot report needs: the
// check before and after, time on each step, and where they got stuck.

export interface CheckResult {
  score: number;
  answers: number[];
  ratings: number[];
  seconds: number;
}

export interface ParticipantSummary {
  id: string;
  firstAt: number;
  lastAt: number;
  stepAt: Partial<Record<Step, number>>;
  before?: CheckResult;
  after?: CheckResult;
  minutes: { lab?: number; practice?: number; total?: number };
  predictions: { section: string; choice: string; correct: boolean }[];
  runs: { section: string; mode?: string; status: string }[];
  customizations: { name: string; rule: string }[];
  notices: { page: string; text: string; at: number }[];
  calls: { page: string; state: string; at: number }[];
  scorecards: { card: Scorecard; transcript: TranscriptLine[]; at: number }[];
  feedback: string[];
}

const minutesBetween = (from?: number, to?: number) =>
  from && to && to >= from ? Math.round((to - from) / 60_000) : undefined;

export function summarize(id: string, events: StoredEvent[]): ParticipantSummary {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const summary: ParticipantSummary = {
    id,
    firstAt: sorted[0]?.at ?? 0,
    lastAt: sorted.at(-1)?.at ?? 0,
    stepAt: {},
    minutes: {},
    predictions: [],
    runs: [],
    customizations: [],
    notices: [],
    calls: [],
    scorecards: [],
    feedback: [],
  };

  for (const event of sorted) {
    switch (event.kind) {
      case 'consent':
        summary.stepAt.consent ??= event.at;
        break;
      case 'step':
        summary.stepAt[event.step] ??= event.at;
        break;
      case 'check': {
        const result = {
          score: checkScore(event.answers),
          answers: event.answers,
          ratings: event.ratings,
          seconds: Math.round((event.at - event.startedAt) / 1000),
        };
        // The first submission counts, if a participant ever sent one twice.
        summary[event.phase] ??= result;
        break;
      }
      case 'prediction':
        summary.predictions.push({ section: event.section, choice: event.choice, correct: event.correct });
        break;
      case 'run':
        summary.runs.push({ section: event.section, mode: event.mode, status: event.status });
        break;
      case 'customize':
        summary.customizations.push({ name: event.name, rule: event.rule });
        break;
      case 'notice':
        summary.notices.push({ page: event.page, text: event.text, at: event.at });
        break;
      case 'call':
        summary.calls.push({ page: event.page, state: event.state, at: event.at });
        break;
      case 'scorecard':
        summary.scorecards.push({ card: event.card, transcript: event.transcript, at: event.at });
        break;
      case 'feedback':
        summary.feedback.push(event.text);
        break;
    }
  }

  const { consent, lab, practice, after, done } = summary.stepAt;
  summary.minutes = {
    lab: minutesBetween(lab, practice),
    practice: minutesBetween(practice, after),
    total: minutesBetween(consent, done ?? summary.lastAt),
  };
  return summary;
}

/** mm:ss after the participant agreed to start, for reading events in order. */
export function sinceStart(summary: ParticipantSummary, at: number): string {
  const start = summary.stepAt.consent ?? summary.firstAt;
  const s = Math.max(0, Math.round((at - start) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
