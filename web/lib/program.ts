// The program Lab 1 would belong to, as a proposal. Only Lab 1 is built; the
// rest says what each lab would teach and how the whole thing would be
// measured. The page at /program/ is drawn from this file, and
// program.test.ts checks that it stays honest: one built lab, every proposed
// lab filled in, and every "recorded today" claim tied to something the pilot
// really records.

/** The four areas the curriculum covers. */
export const TRACKS = {
  fundamentals: 'LiveKit fundamentals',
  architecture: 'Voice AI architecture',
  agents: 'Agents',
  landscape: 'Competitive landscape',
} as const;
export type Track = keyof typeof TRACKS;

export interface ProgramLab {
  number: number;
  track: Track;
  title: string;
  status: 'built' | 'proposed';
  /** Where the built lab lives. */
  href?: string;
  /** The sentence a seller hears from a customer, which this lab teaches them to answer. */
  customerSays: string;
  /** The lab's six parts, in the order a learner meets them. */
  predict: string;
  hear: string;
  tryIt: string;
  askThis: string;
  check: string;
  practice: string;
}

export const LABS: ProgramLab[] = [
  {
    number: 1,
    track: 'architecture',
    title: 'Why real-time voice AI is hard',
    status: 'built',
    href: '/lab/',
    customerSays: '“It keeps cutting people off.”',
    predict: 'What a silence-only agent does when a caller pauses mid-thought, and three more like it.',
    hear: 'One recorded caller on two settings, for turn detection, interruptions, noise and model speed.',
    tryIt: 'The same four things with your own voice, and a restaurant you rename yourself.',
    askThis: '“What do your callers have to say that takes a while? Have you heard that the agent cuts people off?”',
    check: 'Five questions and three confidence ratings, before and after.',
    practice: 'A discovery call with Priya, a CTO whose voice tutor interrupts its learners.',
  },
  {
    number: 2,
    track: 'fundamentals',
    title: 'What a room is',
    status: 'proposed',
    customerSays: '“We already stream audio over a WebSocket. Why would we need WebRTC?”',
    predict: 'A caller’s signal drops to one bar. Which call falls apart first, and how does it sound?',
    hear: 'The same call on a good connection and on one that loses a packet in every ten.',
    tryIt: 'Join one room from your laptop and your phone. Mute one, walk away from the Wi-Fi, and watch what the other sees.',
    askThis: '“What happens to a call today when the caller is on a train, or on one bar of signal?”',
    check: 'Rooms, participants and tracks, in the words a customer would use.',
    practice: 'A prospect whose users are field technicians on patchy mobile data.',
  },
  {
    number: 3,
    track: 'fundamentals',
    title: 'From a phone number to an agent',
    status: 'proposed',
    customerSays: '“Our customers don’t open an app. They call a phone number.”',
    predict: 'A caller dials a number. What has to sit between the phone network and the agent?',
    hear: 'Juniper answering the same booking from a browser and from a real phone line.',
    tryIt: 'Call Juniper from your own phone, then find your call in the project’s sessions.',
    askThis: '“How do callers reach you today, and who carries those calls?”',
    check: 'What a SIP trunk is for, and which side of it LiveKit runs.',
    practice: 'A clinic group moving its appointment line off an old phone menu.',
  },
  {
    number: 4,
    track: 'agents',
    title: 'Build Juniper yourself',
    status: 'proposed',
    customerSays: '“How long until we’d have something our own team could try?”',
    predict: 'You give the agent a tool that looks up opening hours. When does it use it, and when does it guess?',
    hear: 'The same question put to an agent with the tool and to one without.',
    tryIt: 'Build the restaurant agent in Agent Builder, in a LiveKit Cloud project of your own, and give it one tool.',
    askThis: '“Who would build the first version on your side? What would it need to look up or do?”',
    check: 'Instructions, tools and models: which one you change to fix which problem.',
    practice: 'A founder who wants a working demo by Friday and has one engineer.',
  },
  {
    number: 5,
    track: 'agents',
    title: 'Finding out what went wrong',
    status: 'proposed',
    customerSays: '“A call went badly last night and we can’t tell why.”',
    predict: 'A caller waited four seconds for an answer. Where do you look first?',
    hear: 'One bad call, replayed with its transcript and the timing of every step.',
    tryIt: 'Open one of your own Lab 1 calls in Agent Insights and find its slowest turn.',
    askThis: '“When a call goes badly today, how do you find out what happened?”',
    check: 'Reading a turn’s timing, and telling a slow model from a slow hand-off.',
    practice: 'A head of support with a complaint, a call ID and no engineer in the room.',
  },
  {
    number: 6,
    track: 'landscape',
    title: 'Build, buy or bolt on',
    status: 'proposed',
    customerSays: '“The prototype runs on a hosted platform, and the bill keeps doubling.”',
    predict: 'A prototype works at a thousand minutes a month. What breaks first at a million?',
    hear: 'One customer’s situation, argued three ways: a hosted platform, a model provider’s own API, and building it all in-house.',
    tryIt: 'Take that customer through each choice and say, out loud, where LiveKit is the wrong one.',
    askThis: '“What’s the prototype built on, and what’s the first thing that breaks as you grow?”',
    check: 'Which kind of alternative a prospect is describing, from two sentences.',
    practice: 'Priya again, six months on, with a competitor’s quote in hand.',
  },
];

/** Lab 1's six parts. Every proposed lab keeps them. */
export const LAB_SHAPE = [
  {
    name: 'Predict',
    why: 'You lock in a guess before you hear anything. A wrong guess is the point: people remember what surprised them.',
    href: '/lab/#experiment-1',
  },
  {
    name: 'Hear it',
    why: 'One recorded caller, two settings. Nothing else changes, so the difference can’t be put down to luck.',
    href: '/lab/#experiment-1',
  },
  {
    name: 'Try it',
    why: 'Then your own voice. It only counts as understood once you can break it yourself.',
    href: '/lab/#experiment-2',
  },
  {
    name: 'Seller card',
    why: 'What the customer says, what’s happening, what LiveKit does about it, and the question to ask.',
    href: '/lab/#experiment-3',
  },
  {
    name: 'Check',
    why: 'The same few questions before and after, so the lab has to show that it taught something.',
    href: '/build/#pilot',
  },
  {
    name: 'Practice call',
    why: 'A scored call with an AI prospect. Every point needs a quote, and a made-up answer fails the call.',
    href: '/practice/',
  },
] as const;

/** What I'd look at before writing a second lab. */
export const AUDIT = [
  {
    name: 'Twenty recorded calls',
    text: 'Ten won and ten lost, picked by the CRO. I’d mark every moment a seller dodged a technical question, guessed at one, or said “let me get an engineer.”',
  },
  {
    name: 'The engineers who get pulled in',
    text: 'Which questions do they answer every week? Each repeat is a seller card that hasn’t been written yet.',
  },
  {
    name: 'The check, for everyone',
    text: 'Every seller takes Lab 1’s five questions cold, plus a handful per planned lab. Two minutes each, and it’s the baseline the rest is measured against.',
  },
  {
    name: 'Lost-deal notes',
    text: 'Where the reason given is “technical fit” or a competitor’s name, what was the question behind it?',
  },
] as const;

export const PATHS = [
  {
    who: 'AEs and SDRs',
    goal: 'Hold a technical conversation with a customer, and know when to bring in an engineer.',
    steps: [
      'The six labs, one or two a week. Lab 1 takes about half an hour.',
      'A practice call after each pair of labs, with a new prospect each time.',
      'Certified for discovery on a passed practice call.',
    ],
  },
  {
    who: 'Presales and Solutions Architects',
    goal: 'Everything a seller learns, and then the code behind it.',
    steps: [
      'The same six labs first. They need the customer’s words as much as anyone.',
      'Then they change Juniper: add a tool, swap a model, read the agent’s own timing. How it’s built is the first unit.',
      'Certified for demos by running one live and changing a setting mid-call.',
    ],
  },
] as const;

/** What happens to a lab when LiveKit ships a release. */
export const KEEP_CURRENT = [
  {
    name: 'Every product fact has a source and a date',
    text: 'Each seller card lists the LiveKit docs pages it rests on and the day they were last read. A test fails if a card has no source.',
  },
  {
    name: 'A release is read against the cards',
    text: 'The changelog is checked against that list of pages. A card whose page changed gets re-read, and re-dated or rewritten.',
  },
  {
    name: 'Recordings are re-made, not trusted',
    text: 'Each experiment is recorded from a real call in a few minutes. A test fails if a recording no longer shows its lesson, such as a baseline that stops interrupting.',
  },
  {
    name: 'The agent and the pages can’t drift apart',
    text: 'The names they share (the RPCs, the scoring rubric, the facts the judge marks against) are compared by a test on every push.',
  },
] as const;

/**
 * The four measures the program answers to. `recordedToday` is what Lab 1's pilot
 * already stores, and `pilotKinds` are the event kinds in lib/pilot.ts that
 * hold it. `missing` is what a real program would still need.
 */
export const METRICS = [
  {
    metric: 'Seller confidence',
    recordedToday: 'Three ratings from 1 to 5, before the lab and again after the practice call.',
    pilotKinds: ['check'],
    missing: 'The same ratings a month on, once the seller has taken real calls.',
  },
  {
    metric: 'Assessment pass rates',
    recordedToday:
      'The check’s score before and after. Each practice call’s score on six items, and whether it passed. Whether each prediction was right.',
    pilotKinds: ['check', 'scorecard', 'prediction'],
    missing: 'How many tries a pass takes, across a whole group of new sellers.',
  },
  {
    metric: 'Time to first qualified technical conversation',
    recordedToday: 'A stand-in: the time from starting the lab to the first passed practice call.',
    pilotKinds: ['consent', 'scorecard'],
    missing:
      'The real number is in the CRM: the first meeting a Solutions Architect accepts as qualified. What “qualified” means gets agreed with the CRO before anything is counted.',
  },
  {
    metric: 'Ramp time',
    recordedToday: 'When each step was started, so how long each part takes.',
    pilotKinds: ['step'],
    missing: 'A start date and a first closed deal, which live in the HR system and the CRM.',
  },
] as const;

export const ROLLOUT = [
  {
    when: 'Days 1 to 30',
    text: 'The audit. Lab 1 goes to the next new sellers as it is, and gets fixed wherever they get stuck.',
  },
  {
    when: 'Days 31 to 60',
    text: 'Labs 2 to 4, in whatever order the audit says. The first sellers certified for discovery.',
  },
  {
    when: 'Days 61 to 90',
    text: 'Labs 5 and 6, and the demo certification for presales. The four measures go to the CRO every month from here.',
  },
] as const;
