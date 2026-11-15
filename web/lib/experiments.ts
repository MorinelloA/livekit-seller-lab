// With its extension, so `node --test` can load this file too (lib/runSummary.ts needs it).
import { withBase } from './paths.ts';
import type { Mode } from './protocol';

export type ExperimentId = 1 | 2 | 3 | 4;

export interface Experiment {
  id: ExperimentId;
  title: string;
  lead: string;
  switchName: string;
  /** What the two settings are called. Baseline and Enhanced unless given. */
  modeLabels?: Record<Mode, string>;
  settings: Record<Mode, string>;
  prediction: { question: string; options: string[]; expected: number };
  testCaller: string;
  tryYourself: string;
  listenFor: string;
  card: { customerSays: string; happening: string; livekitDoes: string; askThis: string };
}

// Recorded test-caller clips, made by scripts/make_clips_livekit.py and
// scripts/make_clips_exp34.py.
export const CLIPS = {
  tableBooking: withBase('/clips/exp1-table-booking.wav'),
  menuQuestion: withBase('/clips/exp2-menu-question.wav'),
  uhHuh: withBase('/clips/exp2-uh-huh.wav'),
  vegetarian: withBase('/clips/exp2-vegetarian.wav'),
  cafeBooking: withBase('/clips/exp3-cafe-booking.wav'),
  cafe: withBase('/clips/exp3-cafe.wav'),
  saturday: withBase('/clips/exp4-saturday.wav'),
} as const;

/** The words of Experiment 3's booking. Anything else Juniper hears came from the café. */
export const CAFE_BOOKING_LINE = "Hi, I'd like to book a table for two, tomorrow at eight.";

export const DEFAULT_MODE_LABELS: Record<Mode, string> = { baseline: 'Baseline', enhanced: 'Enhanced' };

// Copy from the lab guide, "Seller Lab 1: Why Real-Time Voice AI Is Hard".
export const MAKE_IT_YOUR_OWN = {
  title: 'Make it your own',
  lead: 'An agent’s instructions are plain sentences the LLM reads before every reply. Changing them is the quickest way to see what a voice agent is.',
  prediction: {
    question:
      'You add one rule to the instructions: “Mention tonight’s special before taking a booking.” What changes?',
    options: ['What the agent says', 'How fast it answers', 'How well it hears you'],
    expected: 0,
  },
  doThis:
    'Rename the restaurant, add one rule and press Apply. Juniper greets you as the new restaurant. Then book a table, with your own voice or the test caller’s booking.',
  suggestions: [
    'Mention tonight’s special before taking a booking.',
    'Always ask about allergies.',
    'Offer a table on the patio first.',
  ],
  notice:
    'Your rule shows up in what the agent says. How fast it answers and how well it hears you stay the same, because instructions only steer the LLM. The timing table at the bottom shows the pause staying about the same. The experiments below cover everything around the LLM.',
  answer:
    'Only what it says. The instructions steer the LLM, the part that writes the reply. Hearing, turn-taking and speed come from the rest of the pipeline.',
  experimentsNote:
    'Test-caller runs in the experiments switch back to the original Juniper, so everyone hears the same calls.',
  fullProgram:
    'In the full program, each new hire builds this agent in Agent Builder, LiveKit’s no-code builder, in a sandbox project of their own. This page uses two fields instead, because Agent Builder needs a LiveKit account.',
};

export const EXPERIMENTS: Experiment[] = [
  {
    id: 1,
    title: 'Experiment 1: Knowing when you’re done',
    lead: 'The agent can’t see you, so it has to guess when you’ve finished talking. Silence alone is a weak guess, because people pause in the middle of a thought.',
    switchName: 'Turn detection',
    settings: {
      baseline: 'Ends your turn after a short silence.',
      enhanced: 'Adds LiveKit’s turn detector.',
    },
    prediction: {
      question:
        'A caller says, “I’d like a table for… four people on… Friday at seven,” pausing mid-thought. What will the baseline agent do?',
      options: ['Wait for “seven,” then answer', 'Jump in at the first pause', 'Ask the caller to repeat'],
      expected: 1,
    },
    testCaller:
      'The test caller books a table and stops to think twice, for about two seconds each time: “I’d like a table for… four people on… Friday at seven.”',
    tryYourself:
      'Then say it yourself, pausing a second or two after “for” and after “on,” the way you would if you were checking your calendar.',
    listenFor:
      'Whether the agent starts talking before “seven.” The results show which words each setting heard before it replied. Results can vary between tries, so compare the test caller runs first; they give both settings the same input.',
    card: {
      customerSays: '“It keeps cutting people off,” or “Callers hate reading their account number to it.”',
      happening:
        'The baseline decides you’re done after a short silence. A pause to think, or to find the next digits, looks the same as finishing.',
      livekitDoes:
        'Its turn detector is a model that listens to how you speak, not just whether you’ve stopped: your words, pitch and rhythm. It waits when you sound mid-thought and answers sooner when you sound done. LiveKit built and hosts the model; it’s included for agents deployed on LiveKit Cloud and covers 14 languages.',
      askThis:
        '“What do your callers have to say that takes a while, like account numbers, addresses or medication names? Have you heard that the agent cuts people off?”',
    },
  },
  {
    id: 2,
    title: 'Experiment 2: “Uh-huh” isn’t a stop sign',
    lead: 'When you talk while the agent is talking, it has a split second to decide: are you taking the turn, or just showing you’re listening?',
    switchName: 'Interruptions',
    settings: {
      baseline: 'Stops the agent for any speech that lasts half a second.',
      enhanced: 'Adds LiveKit’s adaptive interruption handling.',
    },
    prediction: {
      question: 'While the agent reads the menu, the caller says “uh-huh.” What will the baseline agent do?',
      options: ['Keep talking', 'Stop mid-sentence', 'Start over from the beginning'],
      expected: 1,
    },
    testCaller:
      'The test caller asks “What’s on the menu tonight?”, says “uh-huh” twice while the agent answers, then cuts in: “Wait, do you have anything vegetarian?”',
    tryYourself:
      'Then try it yourself: say “uh-huh” while Juniper reads the menu, the way you would on a phone call. A very quick one can be too short to stop either setting.',
    listenFor:
      'Whether the agent stops at “uh-huh,” and whether it stops when the caller really cuts in. Both settings should stop for the real question; the difference is the “uh-huh.” When no words follow a stop, the agent picks its sentence back up after about two seconds, so Baseline stalls rather than stopping for good.',
    card: {
      customerSays: '“It stops dead every time a caller says ‘uh-huh,’” or “It won’t stop when people need it to.”',
      happening:
        'Short sounds like “uh-huh” and “mm-hm” are how people show they’re listening. The baseline stops for any speech that lasts half a second, so it stops for those too.',
      livekitDoes:
        'Adaptive interruption handling uses a model trained on real conversations to tell “uh-huh” from a real interruption. It decides from the sound itself, without waiting for a transcript, so the decision is fast. A fuller “yeah, okay” can mean the caller wants to talk, and the model may stop for that. LiveKit runs the model on LiveKit Cloud, and it’s on by default for most agents deployed there.',
      askThis:
        '“When a caller talks over the agent today, what happens? Does it stop when it should, and keep going when it should?”',
    },
  },
  {
    id: 3,
    title: 'Experiment 3: The coffee shop',
    lead: 'Noise does more than make the caller hard to hear. Other people’s voices end up in the transcript as if the caller had said them.',
    switchName: 'Noise',
    settings: {
      baseline: 'Hears the caller’s audio as it comes in.',
      enhanced: 'Runs ai-coustics voice isolation on it first.',
    },
    prediction: {
      question: 'A caller books a table from a busy café. In the baseline, what goes wrong first?',
      options: [
        'The agent’s voice gets distorted',
        'Other people’s words show up in the transcript',
        'The call drops',
      ],
      expected: 1,
    },
    testCaller:
      'The test caller books a table from a busy café. A barista calls out an order before he speaks, and someone at the next table starts talking about a game just after he stops.',
    tryYourself:
      'Then press Café noise and book a table yourself. While you talk, the page mixes the same café into your microphone.',
    listenFor:
      'Words in the transcript that nobody said to the agent, and whether it answers them. The transcripts tell the story better than the sound does.',
    card: {
      customerSays: '“It worked in the demo, but our callers are in cars and kitchens,” or “It answers things nobody said.”',
      happening:
        'The agent hears everything the microphone picks up. A TV or the next table’s conversation gets transcribed as if the caller said it, and the agent replies to it.',
      livekitDoes:
        'LiveKit Cloud runs noise models from Krisp and ai-coustics on the caller’s audio before the agent hears it. Voice isolation keeps the main speaker and removes other voices and noise; it’s priced by the minute, with some minutes included in every plan, and has a version for phone calls. Background noise suppression suits calls with several speakers. In a sample on LiveKit’s docs, voice isolation cut the word error rate from 117.6% to between 7.1% and 14.3%.',
      askThis:
        '“Where are your callers when they talk to the agent: at a desk, in a car, on a job site? Who else is in the room with them?”',
    },
  },
  {
    id: 4,
    title: 'Experiment 4: The pause',
    lead: 'The pause before each answer is a relay of several steps, and callers feel the total.',
    switchName: 'Model',
    modeLabels: { baseline: 'Fast model', enhanced: 'Reasoning model' },
    settings: {
      baseline: 'Answers with Gemma 4 31B, a quick LLM.',
      enhanced: 'Swaps in Grok 4.20 Reasoning, a larger LLM that thinks before it answers.',
    },
    prediction: {
      question: 'When you switch to the reasoning model, which part of the pause grows?',
      options: ['Deciding you were done', 'The LLM’s first words', 'The voice starting to speak'],
      expected: 1,
    },
    testCaller: 'The test caller asks, “What time do you open on Saturday?”',
    tryYourself: 'Then ask it yourself a few times.',
    listenFor:
      'The beat before the answer. After each turn, the timing table at the bottom shows the measured pause and its parts, so compare the numbers as well as the feel. The gap varies from turn to turn, which is why the page keeps every run.',
    card: {
      customerSays:
        '“There’s an awkward pause before every answer,” or “Callers say ‘hello?’ because they think the line dropped.”',
      happening:
        'Each reply passes through several steps: deciding you’re done, turning speech into text, the LLM’s first words, and the voice starting. Each step is a separate model, often from a separate company, and every turn pays for all of them.',
      livekitDoes:
        'It shortens the steps it controls. Its turn detector closes your turn sooner when you sound done, and the agent starts drafting a reply before your turn is confirmed. The speech, LLM and voice models come from providers such as Deepgram, OpenAI, Google and Cartesia, all through one LiveKit account with LiveKit Inference. Agent Console and Agent Insights time each step, so the slow one is easy to find.',
      askThis:
        '“How long is the pause on your calls today, and do callers notice it? Do you know which step is slowest?”',
    },
  },
];
