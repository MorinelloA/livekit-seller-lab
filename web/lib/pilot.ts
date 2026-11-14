import { getAccessCode, getPilotId, postApi } from '@/lib/access';
import type { CheckPhase } from '@/lib/check';
import { withBase } from '@/lib/paths';
import type { Scorecard } from '@/lib/practice';

// A pilot participant's session is recorded as a series of events: the check
// answers, which step they're on, their predictions and test-caller runs, what
// went wrong, and each practice call's scorecard and transcript. Nothing is
// recorded before they agree to it, and nothing for anyone outside the pilot.

/** The pilot's steps, in order. Consent comes first and isn't numbered. */
export const STEPS = ['consent', 'before', 'lab', 'practice', 'after', 'done'] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Exclude<Step, 'consent' | 'done'>, string> = {
  before: 'Step 1 of 4: the check before the lab.',
  lab: 'Step 2 of 4: the lab.',
  practice: 'Step 3 of 4: the practice call.',
  after: 'Step 4 of 4: the check after the lab.',
};

export type PilotEvent =
  | { kind: 'consent' }
  | { kind: 'step'; step: Step }
  | { kind: 'check'; phase: CheckPhase; answers: number[]; ratings: number[]; startedAt: number }
  | { kind: 'call'; page: 'lab' | 'practice'; state: 'connected' | 'ended' | 'time_limit' }
  | { kind: 'prediction'; section: string; choice: string; correct: boolean }
  | { kind: 'run'; section: string; mode?: string; status: 'done' | 'failed' }
  | { kind: 'customize'; name: string; rule: string }
  | { kind: 'notice'; page: 'lab' | 'practice'; text: string }
  | { kind: 'scorecard'; card: Scorecard; transcript: TranscriptLine[] }
  | { kind: 'feedback'; text: string };

export interface TranscriptLine {
  time: string;
  who: string;
  text: string;
}

/** An event as stored: the browser's time it happened, and the server's time it arrived. */
export type StoredEvent = PilotEvent & { at: number; receivedAt?: number };

// Progress lives in this browser too, so the pilot page knows which step is next.
const progressKey = (pilot: string) => `lab.pilot.${pilot}.progress`;
const checksKey = (pilot: string) => `lab.pilot.${pilot}.checks`;

export type Progress = Partial<Record<Step, number>>;

export function readProgress(): Progress {
  const pilot = getPilotId();
  if (!pilot) return {};
  try {
    return JSON.parse(localStorage.getItem(progressKey(pilot)) ?? '{}') as Progress;
  } catch {
    return {};
  }
}

/** The pilot code, once its owner has agreed to be recorded. Empty otherwise. */
export function consentedPilot(): string {
  const pilot = getPilotId();
  return pilot && readProgress().consent ? pilot : '';
}

/** Records one event for a pilot participant who has agreed to it. Never throws. */
export function logPilot(event: PilotEvent): void {
  const pilot = event.kind === 'consent' ? getPilotId() : consentedPilot();
  if (!pilot) return;
  const body = JSON.stringify({ pilot, event: { ...event, at: Date.now() } });
  void fetch(withBase('/api/pilot'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Lab-Code': getAccessCode() },
    body,
    // Lets the event finish sending if the page is closing. Browsers cap it at 64 KB.
    keepalive: body.length < 60_000,
  }).catch(() => undefined);
}

/** Marks a step as reached (the first time only) and records it. */
export function reachStep(step: Step): Progress {
  const pilot = getPilotId();
  const progress = readProgress();
  // Nothing moves until the participant has agreed to take part.
  if (!pilot || progress[step] || (step !== 'consent' && !progress.consent)) return progress;
  const next = { ...progress, [step]: Date.now() };
  localStorage.setItem(progressKey(pilot), JSON.stringify(next));
  logPilot(step === 'consent' ? { kind: 'consent' } : { kind: 'step', step });
  return next;
}

/** The step this participant is on: the last one reached, or consent before any. */
export function currentStep(progress: Progress): Step {
  let current: Step = 'consent';
  for (const step of STEPS) {
    if (progress[step]) current = step;
  }
  return current;
}

export interface CheckAnswers {
  answers: number[];
  ratings: number[];
}

/** The participant's own answers, kept in this browser to show them at the end. */
export function readChecks(): Partial<Record<CheckPhase, CheckAnswers>> {
  const pilot = getPilotId();
  if (!pilot) return {};
  try {
    return JSON.parse(localStorage.getItem(checksKey(pilot)) ?? '{}') as Partial<Record<CheckPhase, CheckAnswers>>;
  } catch {
    return {};
  }
}

export function saveCheck(phase: CheckPhase, answers: CheckAnswers): void {
  const pilot = getPilotId();
  if (!pilot) return;
  localStorage.setItem(checksKey(pilot), JSON.stringify({ ...readChecks(), [phase]: answers }));
}

export interface TokenResponse {
  serverUrl: string;
  roomName: string;
  participantToken: string;
}

/**
 * A room with the agent dispatched to it: Juniper for the lab, Priya for a
 * practice call. A consenting pilot participant's calls carry their code, so
 * the agent records them.
 */
export function requestRoom(mode: 'lab' | 'practice'): Promise<TokenResponse> {
  const pilot = consentedPilot();
  return postApi<TokenResponse>('token', pilot ? { mode, pilot } : { mode });
}
