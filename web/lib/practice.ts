import type { TurnEvent } from '@/lib/protocol';

// Names shared with agent/src/prospect.py. Change both together.
export const SCORECARD_TOPIC = 'practice.scorecard';
export const RPC_FINISH = 'practice.finish';

// LiveKit Agents reads text sent on this topic as the user's turn.
export const CHAT_TOPIC = 'lk.chat';

export const PASS_MARK = 8;
export const MAX_TYPED_CHARS = 500;

/** A turn of the practice call. Times count from callStartedAt, as the scorecard's do. */
export type PracticeTurn = Omit<TurnEvent, 'settings'> & { callStartedAt: number };

export interface ScoredItem {
  id: number;
  title: string;
  score: number;
  /** The words the score rests on, found in the transcript. Empty means no evidence. */
  quote: string;
  /** When the quote was said, as mm:ss from the start of the call. */
  time: string;
  /** What would have earned the missing points. Empty for a 2. */
  improve: string;
}

export interface Scorecard {
  items: ScoredItem[];
  total: number;
  max: number;
  passMark: number;
  passed: boolean;
  /** A made-up technical answer. It fails the call, whatever the total. */
  bluff: { quote: string; time: string } | null;
  /** What the coach says out loud. */
  coach: string;
}

export type ScorecardMessage = ({ status: 'done' } & Scorecard) | { status: 'failed' };

/** What the learner sees before the call, as the kit's labelled rows. Priya knows much more. */
export const BRIEF = [
  { label: 'Company', text: 'Fluento, a 12-person startup' },
  { label: 'Product', text: 'A language-learning app that includes a voice tutor' },
  { label: 'How she found us', text: 'She booked the call from LiveKit’s website' },
] as const;

/** The lab guide's rubric, with what earns the full 2 points. */
export const RUBRIC = [
  {
    id: 1,
    title: 'The callers',
    full: 'Learn where her users are when they talk to the app, and how they talk: pauses, long answers, languages.',
  },
  {
    id: 2,
    title: 'What’s going wrong',
    full: 'Get the complaint in Priya’s own words, and dig into it.',
  },
  {
    id: 3,
    title: 'Ties a problem to LiveKit',
    full: 'Explain one of her problems in plain words, and what LiveKit does about it, correctly.',
  },
  {
    id: 4,
    title: 'Technical honesty',
    full: 'Answer what you know correctly, and offer an engineer for the rest.',
  },
  {
    id: 5,
    title: 'Listening',
    full: 'Let her finish, use her words in your follow-ups, and save the pitch until after discovery.',
  },
  {
    id: 6,
    title: 'Technical next step',
    full: 'Book a dated technical follow-up with the right people, such as a session with a LiveKit engineer.',
  },
] as const;

/** Seconds as mm:ss, the way the scorecard gives times. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
