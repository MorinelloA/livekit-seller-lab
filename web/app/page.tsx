import type { Metadata } from 'next';
import { Replay, type ReplayExperiment } from '@/components/overview/Replay';
import { brandCase, Eyebrow } from '@/components/ui/Bits';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DEFAULT_MODE_LABELS, type ExperimentId, EXPERIMENTS } from '@/lib/experiments';
import type { Mode } from '@/lib/protocol';
import { loadRecording, RECORDED, type Recording } from '@/lib/recordings';
import { capturedDate } from '@/lib/replay';
import { outcomeSentence, runOutcome } from '@/lib/runSummary';
import { AUTHOR } from '@/lib/site';
import { Scroller } from '@/components/ui/Scroller';

export const metadata: Metadata = {
  title: { absolute: 'Seller Lab: Why Real-Time Voice AI Is Hard' },
  description: 'A hands-on LiveKit lab for new sellers, with a scored practice call and a pilot.',
};

const MODES: Mode[] = ['baseline', 'enhanced'];

/** What each setting does, in a few words, for its lane on the replay. */
const SETTING_IN_SHORT: Record<ExperimentId, Record<Mode, string>> = {
  1: { baseline: 'silence ends the turn', enhanced: 'LiveKit’s turn detector' },
  2: { baseline: 'half a second of speech stops Juniper', enhanced: 'adaptive interruption handling' },
  3: { baseline: 'the audio as it comes in', enhanced: 'voice isolation first' },
  4: { baseline: 'Gemma 4 31B', enhanced: 'Grok 4.20 Reasoning' },
};

/** What a recording's sound can't show. A listener should know before judging the setting by ear. */
const REPLAY_NOTES: Partial<Record<ExperimentId, string>> = {
  3: 'Both recordings play the café as the caller’s phone sent it. Voice isolation works on the agent’s side, so its effect is in what Juniper heard, not in this sound.',
};

/**
 * What the replay shows for one experiment, read from its recording at build
 * time: the labels, the day, and each run's outcome in lib/runSummary.ts's words.
 */
function replayOf(id: ExperimentId, runs: Recording): ReplayExperiment {
  const experiment = EXPERIMENTS.find((e) => e.id === id)!;
  const names = experiment.modeLabels ?? DEFAULT_MODE_LABELS;
  return {
    id,
    switchName: experiment.switchName,
    recordedOn: capturedDate(runs.baseline.capturedAt),
    note: REPLAY_NOTES[id],
    settings: MODES.map((mode) => ({
      mode,
      name: names[mode],
      label: `${names[mode]} · ${SETTING_IN_SHORT[id][mode]}`,
      summary: outcomeSentence(runOutcome(id, runs[mode].events)),
      durationMs: runs[mode].audio?.durationMs ?? null,
    })),
  };
}

function SectionHead({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="display m-0 text-section leading-heading">
        {title}
      </h2>
    </div>
  );
}

function Arrow() {
  return <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />;
}

const PARTS = [
  {
    eyebrow: 'The lab',
    title: 'Make it your own, then four experiments',
    body: 'Rename the restaurant and give Juniper a house rule. Then turn detection, interruptions, background noise and model speed: each one runs the same test caller on both settings before you try it with your own voice.',
    meta: 'Headphones · Chrome or Edge on a laptop',
    href: '/lab/',
    cta: 'Open the lab',
  },
  {
    eyebrow: 'The practice call',
    title: 'A discovery call with Priya, an AI prospect',
    body: 'Eight to ten minutes with the CTO of a 12-person startup. A judge scores the call on six items, and every point needs a quote from the call. Make up a technical answer and the call fails. Then a coach talks you through it.',
    meta: 'Pass at 8 of 12 · No made-up answers',
    href: '/practice/',
    cta: 'Call Priya',
  },
  {
    eyebrow: 'The pilot',
    title: 'A check before and after, with consent first',
    body: 'Five questions and three ratings before the lab, and the same again after the practice call. Nothing is recorded until a participant agrees. Each session gets its own page of results, which can be deleted.',
    meta: 'Four steps · About 50 minutes',
    href: '/build/#pilot',
    cta: 'How the pilot works',
  },
];

const RESULTS = [
  {
    name: '1. Turn detection',
    baseline: 'Both runs jumped in after “I’d like a table for” and answered at each pause.',
    enhanced: 'Both runs heard the whole sentence as one turn and answered once.',
  },
  {
    name: '2. Interruptions',
    baseline: 'Both runs stopped at each “uh-huh” and picked the sentence back up about two seconds later.',
    enhanced: 'Both runs read on through both “uh-huh”s and stopped only for the vegetarian question.',
  },
  {
    name: '3. The coffee shop',
    baseline:
      'Every run heard the next table as part of the call: 11 or 12 words nobody said, like “No way. Did you see the game last night?” And Juniper answered them.',
    enhanced: 'With voice isolation, every run heard only the caller, and Juniper went straight on to ask for a name.',
  },
  {
    name: '4. The pause',
    note: 'fast vs reasoning model',
    baseline: '0.54 to 0.69 seconds before the answer; the LLM’s first words took 0.12 to 0.17 of it.',
    enhanced: '1.77 to 2.23 seconds; the LLM’s first words took 1.32 to 1.82 of it.',
  },
];

const PATH = [
  { name: 'Browser', detail: 'Next.js pages and livekit-client' },
  { name: 'Cloudflare Worker', detail: 'Access code, daily cap, a 2-minute join token' },
  { name: 'LiveKit Cloud', detail: 'The room, and the agent dispatched to it' },
  { name: 'Agent', detail: 'Python on LiveKit Agents 1.8: Juniper, Priya, the coach', accent: true },
  { name: 'Models', detail: 'Deepgram Nova-3 and Aura-2, LLMs on LiveKit Inference' },
];

const DECISIONS = [
  {
    title: 'Settings switch on a live call',
    body: (
      <>
        Turn detection changes on the running session with{' '}
        <code className="rounded-sm bg-fill px-1.5 py-px font-mono text-[0.88em] text-fg">update_options</code>. Interruption
        settings are fixed when an agent is created, so that switch hands off to a fresh Juniper that keeps the conversation.
      </>
    ),
  },
  {
    title: 'Both settings hear the same audio',
    body: 'Test-caller clips play into one published microphone track through a Web Audio mixer. Your own microphone joins the mix only when you try it yourself.',
  },
  {
    title: 'The judge has to show its work',
    body: 'A point needs a quote that’s really in the call, matched word for word. A made-up technical answer zeroes technical honesty and fails the call, whatever the total. Ten tests cover these rules.',
  },
  {
    title: 'A public demo that stays cheap',
    body: 'Rooms need the access code, checked in constant time. At most 40 rooms a day; join tokens last two minutes; calls end on their own.',
  },
];

export default async function OverviewPage() {
  // Every recording is read here, on the server, for its labels and outcomes. Only the first
  // experiment's runs go to the browser with the page; the others load when a visitor picks them.
  const recordings = await Promise.all(RECORDED.map(loadRecording));
  const replays = RECORDED.map((id, i) => replayOf(id, recordings[i]));

  return (
    <main id="main">
      <section className="page-column flex flex-col gap-6 pt-20 pb-14 sm:pt-24">
        <Eyebrow>Seller Lab 1 · A hands-on lab for new LiveKit sellers</Eyebrow>
        <h1 className="display m-0 max-w-[920px] text-hero leading-[1.04]">
          Why real-time voice AI is <span className="text-accent">hard</span>
        </h1>
        <p className="m-0 max-w-[680px] text-lg leading-reading tracking-body [text-wrap:pretty]">
          Juniper is a voice agent that answers the phone for a made-up restaurant. Each experiment plays it the same
          recorded caller twice: once on a baseline setting, once on LiveKit’s. You predict what will happen, hear the
          difference, try it with your own voice, and leave with the question to ask a customer.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-2">
          <ButtonLink href="/lab/" variant="primary" size="stack">
            Start the lab
            <Arrow />
          </ButtonLink>
          <ButtonLink href="/build/" size="stack">
            How it’s built
          </ButtonLink>
          <p className="m-0 text-sm text-subtle">Built by {AUTHOR.name} as a work sample for LiveKit</p>
        </div>
      </section>

      <section aria-labelledby="replay-title" className="page-column">
        <Replay experiments={replays} first={recordings[0]} />
      </section>

      <section aria-labelledby="inside-title" className="page-column flex flex-col gap-8 pt-24">
        <SectionHead eyebrow="What’s inside" id="inside-title" title="Two things to try, and a pilot that checks whether they teach" />
        <div className="grid gap-4 lg:grid-cols-3">
          {PARTS.map((part) => (
            <article key={part.eyebrow} className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-7">
              <Eyebrow size="sm">{part.eyebrow}</Eyebrow>
              <h3 className="m-0 text-title leading-snug font-normal tracking-title text-fg">{part.title}</h3>
              <p className="m-0 text-card leading-reading">{part.body}</p>
              <p className="m-0 font-mono text-xs leading-relaxed text-subtle">{part.meta}</p>
              <ButtonLink href={part.href} variant="quiet" className="mt-auto self-start">
                {part.cta}
                <Arrow />
              </ButtonLink>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="results-title" className="page-column flex flex-col gap-8 pt-24">
        <SectionHead eyebrow="What the live runs showed" id="results-title" title="Same clips, two runs per setting, on LiveKit Cloud" />
        <Scroller label="What the live runs showed" className="rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-left text-card leading-relaxed">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="w-[22%] border-b border-line px-5 py-3.5 eyebrow-sm text-subtle">
                  Experiment
                </th>
                <th scope="col" className="border-b border-line px-5 py-3.5 eyebrow-sm text-subtle">
                  Baseline
                </th>
                <th scope="col" className="border-b border-line px-5 py-3.5 eyebrow-sm text-accent">
                  Enhanced
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {RESULTS.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className="px-5 py-[18px] align-top font-medium text-fg">
                    {row.name}
                    {row.note && <span className="block font-mono text-xs font-normal text-subtle">{row.note}</span>}
                  </th>
                  <td className="px-5 py-[18px] align-top">{row.baseline}</td>
                  <td className="px-5 py-[18px] align-top">{row.enhanced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-line p-6">
            <Eyebrow size="sm">A cheaper judge</Eyebrow>
            <p className="m-0 text-card leading-reading">
              On two saved practice calls, scored twice each, gpt-5.4-mini reached the same verdicts as gpt-5.5. It takes 2
              to 4 seconds instead of 4.5 to 6.5, and costs about a tenth as much. So it’s the judge now.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-line p-6">
            <Eyebrow size="sm">The hosted lab, end to end</Eyebrow>
            <p className="m-0 text-card leading-reading">
              The cloud agent joined within 8 seconds. A typed practice call came back scored, with a quote and a time for
              each point, within 15 seconds of hanging up.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="build-title" className="page-column flex flex-col gap-8 pt-24">
        <SectionHead eyebrow="How it’s built" id="build-title" title="One Python worker plays every voice in the lab" />
        <ol aria-label="How a call travels" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {PATH.map((hop) => (
            <li
              key={hop.name}
              className={`flex flex-[1_1_180px] flex-col gap-1.5 rounded-lg border bg-surface px-[18px] py-4 ${hop.accent ? 'border-accent-line' : 'border-line'}`}
            >
              <span className={`eyebrow-sm ${hop.accent ? 'text-accent' : 'text-subtle'}`}>{brandCase(hop.name)}</span>
              <span className="text-sm leading-normal text-fg">{hop.detail}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-4 md:grid-cols-2">
          {DECISIONS.map((decision) => (
            <article key={decision.title} className="flex flex-col gap-2.5 rounded-lg border border-line p-6">
              <h3 className="m-0 text-lg leading-snug font-medium text-fg">{decision.title}</h3>
              <p className="m-0 text-card leading-reading">{decision.body}</p>
            </article>
          ))}
        </div>
        <div>
          <ButtonLink href="/build/">
            Read how it’s built
            <Arrow />
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
