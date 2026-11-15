// Run with `pnpm test` (node --test; Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTurn, type LoggedEvent, type TurnMetrics } from './protocol.ts';
import { extraWords, firstExchange, outcomeIsEmpty, outcomeSentence, pauseRows, runOutcome, words } from './runSummary.ts';

const SETTINGS = { turn_detection: 'enhanced', interruptions: 'enhanced', noise: 'baseline', model: 'fast' } as const;

const metrics = (m: Partial<TurnMetrics> = {}): TurnMetrics => ({
  end_of_turn_delay: null,
  transcription_delay: null,
  llm_node_ttft: null,
  tts_node_ttfb: null,
  e2e_latency: null,
  ...m,
});

let nextId = 0;
function turn(role: 'user' | 'assistant', text: string, options: { interrupted?: boolean; metrics?: Partial<TurnMetrics> } = {}): LoggedEvent {
  nextId += 1;
  return {
    type: 'turn',
    id: `t${nextId}`,
    role,
    text,
    interrupted: options.interrupted ?? false,
    settings: SETTINGS,
    metrics: metrics(options.metrics),
    createdAt: nextId,
    runId: 'run',
    receivedAt: nextId,
  };
}
const caller = (text: string, m?: Partial<TurnMetrics>) => turn('user', text, { metrics: m });
const juniper = (text: string, options?: { interrupted?: boolean; metrics?: Partial<TurnMetrics> }) => turn('assistant', text, options);
const falseStop = (): LoggedEvent => ({ type: 'false_interruption', resumed: true, settings: SETTINGS, createdAt: 0, runId: 'run', receivedAt: 0 });

const sentence = (experiment: 1 | 2 | 3 | 4, events: LoggedEvent[]) => outcomeSentence(runOutcome(experiment, events));

test('Experiment 1: a run that jumps in says what it had heard, and counts in words', () => {
  const events = [
    caller("I'd like a table for"),
    juniper('How many people will be in your party?', { interrupted: true }),
    caller('four people on'),
    juniper('Which day would you like to join us?', { interrupted: true }),
    caller('Friday at seven.'),
    juniper('And may I have a name for the booking?'),
  ];
  assert.deepEqual(runOutcome(1, events), { experiment: 1, heardFirst: "I'd like a table for", replies: 3, cutOff: 2 });
  assert.equal(
    sentence(1, events),
    "Juniper heard “I'd like a table for” before its first answer. It started answering 3 times and was cut off twice.",
  );
});

test('Experiment 1: one answer is "once", never "1 time"', () => {
  const whole = [caller("I'd like a table for four people on Friday at seven."), juniper('May I have a name for the booking, please?')];
  assert.equal(
    sentence(1, whole),
    "Juniper heard “I'd like a table for four people on Friday at seven.” before its first answer. It started answering once and was never cut off.",
  );
  const twice = [caller("I'd like a table for"), juniper('How many?', { interrupted: true }), caller('four'), juniper('Which day?')];
  assert.match(sentence(1, twice), /It started answering twice and was cut off once\.$/);
  assert.doesNotMatch(sentence(1, whole) + sentence(1, twice), /\b1 time\b/);
});

test('Experiment 1: nothing heard, and heard but never answered', () => {
  assert.equal(sentence(1, []), 'Juniper didn’t hear the caller.');
  assert.equal(outcomeIsEmpty(runOutcome(1, [])), true);
  assert.equal(sentence(1, [caller('Hello?')]), 'Juniper heard “Hello?” and didn’t answer.');
});

test('Experiment 2: stops that picked up again are counted from false interruptions', () => {
  const events = [
    caller("What's on the menu tonight?"),
    falseStop(),
    falseStop(),
    juniper('We have charred carrots. Then there is a little gem', { interrupted: true }),
    caller('Wait. Do you have anything vegetarian?'),
    juniper('Yes, the carrots are vegetarian.'),
  ];
  // The cut-off before the real question isn't a stop for "uh-huh".
  assert.deepEqual(runOutcome(2, events), { experiment: 2, stops: 2, resumed: 2, heardQuestion: true });
  assert.equal(sentence(2, events), 'Juniper stopped for “uh-huh” twice, and picked up again after a pause each time. Heard the real question: yes.');
});

test('Experiment 2: a stop that became a caller’s turn counts too, and no stops reads as "never"', () => {
  const fullStop = [
    caller("What's on the menu tonight?"),
    juniper('We have charred carrots', { interrupted: true }),
    caller('Uh-huh.'),
    juniper('As I was saying, charred carrots', { interrupted: true }),
    caller('Wait, do you have anything vegetarian?'),
    juniper('Yes.'),
  ];
  assert.deepEqual(runOutcome(2, fullStop), { experiment: 2, stops: 1, resumed: 0, heardQuestion: true });
  assert.equal(sentence(2, fullStop), 'Juniper stopped for “uh-huh” once. Heard the real question: yes.');

  const mixed = [falseStop(), ...fullStop];
  assert.equal(sentence(2, mixed), 'Juniper stopped for “uh-huh” twice, and picked up again once. Heard the real question: yes.');

  const one = [caller('Menu?'), falseStop(), juniper('We have carrots.')];
  assert.equal(sentence(2, one), 'Juniper stopped for “uh-huh” once, and picked up again after a pause. Heard the real question: no.');

  const none = [
    caller("What's on the menu tonight?"),
    juniper('We have charred carrots, a little gem salad. We have', { interrupted: true }),
    caller('Wait. Do you have anything vegetarian?'),
    juniper('Yes.'),
  ];
  assert.equal(sentence(2, none), 'Juniper never stopped for “uh-huh”. Heard the real question: yes.');
});

test('Experiment 3: the booking’s own words never count as extra, with either apostrophe', () => {
  assert.deepEqual(words("Hi. I'd like to book"), ['hi', "i'd", 'like', 'to', 'book']);
  assert.deepEqual(words('I’d'), ["i'd"]);
  assert.deepEqual(extraWords("Hi. I'd like to book a table for two tomorrow at eight."), []);
  assert.deepEqual(extraWords('Hi, I’d like to book a table for two, tomorrow at eight.'), []);
  const clean = [caller('Hi.'), caller("I'd like to book a table for two tomorrow at eight."), juniper('May I have a name?')];
  assert.equal(sentence(3, clean), 'Juniper heard only the caller.');
});

test('Experiment 3: the café’s words are listed, with the full stop outside the quote', () => {
  const noisy = [
    caller("Hi. I'd like to book a table for two tomorrow at eight."),
    caller('No way. Did you see the game last night?'),
    caller('It went to over'),
    juniper('It really did. What name should I put the booking under?'),
  ];
  const outcome = runOutcome(3, noisy);
  assert.equal(outcome.experiment === 3 && outcome.extra.length, 12);
  assert.equal(
    outcomeSentence(outcome),
    'Juniper heard 12 words nobody said to it: “no way did you see the game last night it went over”.',
  );
  assert.equal(sentence(3, [caller("I'd like a table, thanks.")]), 'Juniper heard 1 word nobody said to it: “thanks”.');
  assert.equal(sentence(3, [juniper('Hello?')]), 'Juniper didn’t hear the caller.');
});

test('Experiment 4: the pause and the LLM’s share, to two places', () => {
  const events = [
    caller('What time do you open on Saturday?', { end_of_turn_delay: 0.33, transcription_delay: 0.21 }),
    juniper("We open at five o'clock.", { metrics: { llm_node_ttft: 1.7915369, tts_node_ttfb: 0.2212834, e2e_latency: 2.2323933 } }),
  ];
  assert.deepEqual(runOutcome(4, events), { experiment: 4, answered: true, pause: 2.2323933, llm: 1.7915369 });
  assert.equal(sentence(4, events), 'The pause before Juniper’s answer was 2.23 s. The LLM’s first words took 1.79 s of it.');
  assert.equal(outcomeIsEmpty(runOutcome(4, events)), false);
});

test('Experiment 4: an answer without timing says so, and so does no answer', () => {
  const untimed = [caller('What time do you open?'), juniper('At five.', { metrics: { llm_node_ttft: 0.2 } })];
  assert.equal(sentence(4, untimed), 'Juniper answered, but no timing came back for that turn.');
  assert.equal(outcomeIsEmpty(runOutcome(4, untimed)), true);
  assert.equal(sentence(4, [caller('What time do you open?')]), 'Juniper didn’t answer.');
});

test('the pause’s parts come from the first exchange: the caller’s turn just before the first answer', () => {
  const events = [
    caller('Hello?', { end_of_turn_delay: 9, transcription_delay: 9 }),
    caller('What time do you open?', { end_of_turn_delay: 0.35, transcription_delay: 0.2 }),
    juniper('At five.', { metrics: { llm_node_ttft: 0.15, tts_node_ttfb: 0.21, e2e_latency: 0.58 } }),
    juniper('Anything else?', { metrics: { llm_node_ttft: 5, tts_node_ttfb: 5, e2e_latency: 5 } }),
  ];
  const turns = events.filter(isTurn);
  assert.equal(firstExchange(turns)?.user?.text, 'What time do you open?');
  assert.deepEqual(
    pauseRows([turns, []]).map((row) => [row.key, ...row.values]),
    [
      ['end_of_turn_delay', 0.35, null],
      ['transcription_delay', 0.2, null],
      ['llm_node_ttft', 0.15, null],
      ['tts_node_ttfb', 0.21, null],
      ['e2e_latency', 0.58, null],
    ],
  );
});
