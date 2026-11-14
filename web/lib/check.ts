// The before-and-after check, as in the lab guide: one question on each of the
// four problems, and the discovery question for noise. Answers: 1c, 2a, 3b, 4c, 5a.

export type CheckPhase = 'before' | 'after';

export interface CheckQuestion {
  /** Which part of the lab teaches it. */
  taughtIn: string;
  question: string;
  options: string[];
  answer: number;
}

export const CHECK_QUESTIONS: CheckQuestion[] = [
  {
    taughtIn: 'Experiment 1',
    question: 'A caller pauses mid-sentence and the agent jumps in. What’s the most likely cause?',
    options: [
      'The LLM is too small.',
      'The voice is too slow.',
      'The agent decided the caller was done after a short silence.',
    ],
    answer: 2,
  },
  {
    taughtIn: 'Experiment 2',
    question: 'An agent stops talking every time a caller says “uh-huh.” What would fix that?',
    options: ['Adaptive interruption handling.', 'A faster LLM.', 'A different voice.'],
    answer: 0,
  },
  {
    taughtIn: 'Experiment 3',
    question: 'A caller’s transcript contains words they never said. What’s the most likely cause?',
    options: ['A slow network.', 'Voices in the background.', 'The turn detector.'],
    answer: 1,
  },
  {
    taughtIn: 'Experiment 4',
    question: 'Which part of the pause does a bigger LLM usually lengthen?',
    options: ['Deciding the caller was done.', 'The voice starting to speak.', 'The LLM’s first words.'],
    answer: 2,
  },
  {
    taughtIn: 'Experiment 3’s card',
    question: 'Which question best uncovers a noise problem?',
    options: [
      '“Where are your callers when they talk to the agent?”',
      '“Which LLM do you use?”',
      '“How many calls a month do you get?”',
    ],
    answer: 0,
  },
];

/** Rated from 1 (not at all) to 5 (completely), before and after. */
export const CHECK_RATINGS = [
  'I can explain why a voice agent cuts people off, in words a customer would follow.',
  'I can say what LiveKit does about the four problems in this lab.',
  'I’d be comfortable taking a technical question from a prospect’s engineer.',
];

export const RATING_LABELS = ['Not at all', '', '', '', 'Completely'];

/** How many answers are right. Unanswered questions count as wrong. */
export function checkScore(answers: number[]): number {
  return CHECK_QUESTIONS.filter((q, i) => answers[i] === q.answer).length;
}

/** a, b or c, the way the lab guide writes answers. */
export const letter = (index: number) => (index >= 0 ? String.fromCharCode(97 + index) : '–');
