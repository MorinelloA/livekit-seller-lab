import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArchitectureDiagram } from '@/components/build/ArchitectureDiagram';
import { Eyebrow } from '@/components/ui/Bits';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Icon } from '@/components/ui/Icon';
import { excerpt } from '@/lib/excerpts';
import { RPC_FINISH, SCORECARD_TOPIC, CHAT_TOPIC } from '@/lib/practice';
import { EVENTS_TOPIC, RPC_CUSTOMIZE, RPC_GET_STATE, RPC_RESET, RPC_SET_SETTINGS } from '@/lib/protocol';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Scroller } from '@/components/ui/Scroller';
import { REPO_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How it’s built',
  description: 'The architecture, protocol, tests and cost decisions behind Seller Lab.',
};

// Read from the source when the site is built, so they can't drift from the code.
const CODE = {
  settings: excerpt('agent/src/agent.py', 'if turn_detection in MODES and turn_detection', 'await wait_for_handoff()'),
  mixer: excerpt('web/lib/labMic.ts', 'this.destination = this.context.createMediaStreamDestination();', 'this.track = this.destination'),
  words: excerpt('agent/src/prospect.py', 'def words(text: str) -> str:', 'return " ".join(re.findall('),
  rules: excerpt('agent/src/prospect.py', 'line = find_quote(quote, lines)', 'if rule["id"] == HONESTY_ITEM and bluff:', 1),
  code: excerpt('web/worker/index.ts', 'const [a, b] = await Promise.all([', 'return crypto.subtle.timingSafeEqual(a, b);'),
};

const PROTOCOL = [
  { name: RPC_SET_SETTINGS, kind: 'RPC · page → agent', does: 'Switches one of the four settings on the running call' },
  { name: RPC_RESET, kind: 'RPC · page → agent', does: 'Hands off to a fresh Juniper before a test-caller run' },
  { name: RPC_CUSTOMIZE, kind: 'RPC · page → agent', does: 'Fills a fixed template with a name and a house rule' },
  { name: RPC_GET_STATE, kind: 'RPC · page → agent', does: 'Returns the settings, the exact instructions the LLM reads, and the agent’s clock' },
  { name: RPC_FINISH, kind: 'RPC · page → agent', does: 'Ends Priya’s call, scores it, hands off to the coach' },
  { name: EVENTS_TOPIC, kind: 'Text stream · agent → page', does: 'Each turn’s words, whether it was cut off, when it was spoken, and LiveKit’s timing' },
  { name: SCORECARD_TOPIC, kind: 'Text stream · agent → page', does: 'The scored card, as JSON' },
  { name: CHAT_TOPIC, kind: 'Text stream · page → agent', does: 'Typed turns, which LiveKit Agents reads as speech' },
];

const TUNING = [
  {
    label: '1.8 s pauses',
    text: 'When the clip was tuned, Juniper started answering about 1.2 seconds after the caller stopped (about 0.6 now, on faster speech models). A wrong decision is only audible when the pause is longer than that.',
  },
  {
    label: 'Pauses mid-thought',
    text: '“I’d like a table.” is a finished sentence, and the turn detector rightly said so (0.61 and 0.96). Pausing after “for” and “on” is the real case.',
  },
  {
    label: 'A 0.55 s “uh-huh”',
    text: 'Just over the baseline’s half-second threshold, short enough to sound like listening. A clear “yeah, okay” stopped both settings.',
  },
  { label: 'A natural voice', text: 'With a robot voice, the detector scored the same pause 0.30 in one run and 0.46 in the next.' },
  {
    label: 'The right isolation',
    text: 'On the café booking, ai-coustics Voice Focus S removed the next table every time. Krisp VIVA let it through.',
  },
];

const TESTS = [
  'A good call passes, with times',
  'No quote earns no points',
  'A quote that isn’t in the call scores 0',
  'Matching ignores punctuation, case and accents; only whole words count',
  'A bluff zeroes honesty and fails the call',
  'A bluff must be the seller’s own words',
  'Bad scores and junk items count as zero',
  'JSON in code fences still parses',
  'Each turn of the call gets its time',
  'The schema is strict',
];

const CONTROLS = [
  { name: 'Access code', text: 'Rooms only for the code, compared in constant time.' },
  { name: 'Daily cap', text: 'At most 40 rooms a day.' },
  { name: 'Short tokens', text: 'Good for 2 minutes, just long enough to join.' },
  { name: 'Time limits', text: 'The agent ends a lab session after 40 minutes and a practice call after 15.' },
  { name: 'Out of search', text: 'Every response says noindex; pages send no referrer, so the code in a link stays put.' },
  { name: 'Recording', text: 'Only pilot calls, after consent. Deepgram is asked not to keep audio.' },
];

const PILOT_RECORDS = [
  'consent and step changes',
  'both checks',
  'each locked-in prediction',
  'test-caller runs, recorded runs played, and “Make it your own” changes',
  'every error message shown',
  'each practice call’s scorecard and transcript',
];

const LIMITS = [
  { warn: true, text: 'The café button plays noise only while you talk. That gating needs a real microphone, so it hasn’t been tested yet.' },
  { warn: true, text: 'The pilot has only had a test participant. Priya has only been tried by typing, not by voice.' },
  { warn: true, text: 'Small samples: two runs per setting, and two calls for the judge comparison.' },
  {
    warn: false,
    text: 'Tests cover the scoring rules, the timeline, the recordings, the Worker’s API and the names the agent and the pages share, and they run on every push. Nothing tests a live call end to end: the RPCs against a running agent, or the mixer.',
  },
  { warn: false, text: 'The daily cap is rough: two requests at the same moment can both get through.' },
  { warn: false, text: 'Anyone with the access code can write pilot events. Reading or deleting them takes the admin code.' },
];

const th = 'border-b border-line px-4 py-3 eyebrow-sm text-subtle whitespace-nowrap';

function Feature({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-6 gap-x-12 gap-y-8 pb-24 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={`${id}-title`} className="display m-0 text-subsection leading-heading">
          {title}
        </h2>
        <div className="flex flex-col gap-3.5 text-base leading-reading">{intro}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

export default function BuildPage() {
  return (
    <main id="main" className="page-column">
      <section className="flex max-w-[820px] flex-col gap-5 pt-20 pb-12 sm:pt-24">
        <Eyebrow>How it’s built</Eyebrow>
        <h1 className="display m-0 text-feature leading-[1.06]">What happens after you press Call Juniper</h1>
        <p className="m-0 text-lg leading-reading tracking-body [text-wrap:pretty]">
          The pages are static files. A small Cloudflare Worker hands out rooms and never calls LiveKit’s API: the agent
          dispatch rides inside the join token. Everything you hear comes from one Python worker on LiveKit Cloud. It plays
          Juniper, Priya and the coach, and asks a separate model to score your practice call.
        </p>
      </section>

      <section aria-labelledby="arch-title" className="flex flex-col gap-5 pb-24">
        <Eyebrow as="h2" id="arch-title">
          The path of a call
        </Eyebrow>
        <ArchitectureDiagram />
      </section>

      <Feature
        id="protocol"
        eyebrow="The page drives the agent"
        title="Settings switch on a live call"
        intro={
          <>
            <p className="m-0">
              The lab never reconnects to change a setting. The page calls the agent over LiveKit RPC and the agent changes
              the running session. Turn detection, noise isolation and the model change in place. Interruption settings are
              fixed when an agent is created, so that switch hands off to a fresh Juniper that keeps the conversation.
            </p>
            <p className="m-0">
              Before each test-caller run, <code className="rounded-sm bg-fill px-1.5 font-mono text-[0.86em] text-fg">{RPC_RESET}</code>{' '}
              does the same handoff with an empty history, so both runs start alike.
            </p>
          </>
        }
      >
        <Scroller label="RPC methods and text streams" className="rounded-lg border border-line">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm leading-normal">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className={th}>Name</th>
                <th scope="col" className={th}>Kind</th>
                <th scope="col" className={th}>What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PROTOCOL.map((row) => (
                <tr key={row.name}>
                  <td className="px-4 py-3 font-mono text-small whitespace-nowrap text-fg">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-subtle">{row.kind}</td>
                  <td className="px-4 py-3">{row.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <CodeBlock file="agent/src/agent.py" note="lab.set_settings" lang="python" code={CODE.settings} />
      </Feature>

      <Feature
        id="test-caller"
        eyebrow="The test caller"
        title="Both settings hear the same audio"
        intro={
          <>
            <p className="m-0">
              The page publishes one microphone track, fed by a Web Audio mixer. Test-caller clips play straight into it, so
              the agent hears exactly the same sound on both settings. Your own microphone joins the mix only for “try it
              yourself.”
            </p>
            <p className="m-0">Getting a clip that shows the difference took tuning. The numbers came from live runs.</p>
          </>
        }
      >
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-line p-0">
          {TUNING.map((item, i) => (
            <li key={item.label} className={`grid gap-x-6 gap-y-1.5 px-[18px] py-4 sm:grid-cols-[180px_minmax(0,1fr)] ${i ? 'border-t border-line' : ''}`}>
              <span className="font-mono text-small text-fg">{item.label}</span>
              <span className="text-sm leading-relaxed">{item.text}</span>
            </li>
          ))}
        </ul>
        <CodeBlock file="web/lib/labMic.ts" note="one track, many sources" lang="ts" code={CODE.mixer} />
      </Feature>

      <Feature
        id="timeline"
        eyebrow="Drawing the conversation"
        title="A timeline from two clocks"
        intro={
          <>
            <p className="m-0">
              The page notes when each clip starts and when Juniper’s state changes, on its own clock. The agent reports when
              every turn’s speech started and stopped, on its clock. A quick RPC before each run measures the difference, so
              both land on one axis.
            </p>
            <p className="m-0">
              The live runs turned up a surprise. When a reply is cut off, LiveKit pauses it first and reports it stopped only
              once it gives up the turn, about a second later. So the timeline draws what a listener heard, from the state
              changes, and takes the words and the cut from the agent’s turns. Eight tests pin that down.
            </p>
          </>
        }
      >
        <figure className="m-0 flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
          <figcaption className="eyebrow-sm text-subtle">Measured on a cut-off reply</figcaption>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2.5 text-sm">
            <dt>Juniper started speaking</dt>
            <dd className="m-0 text-right font-mono tabular-nums text-fg">2.65 s</dd>
            <dt>The caller started again</dt>
            <dd className="m-0 text-right font-mono tabular-nums text-fg">3.56 s</dd>
            <dt>Juniper went quiet, as the page saw it</dt>
            <dd className="m-0 text-right font-mono tabular-nums text-accent">4.10 s</dd>
            <dt>The agent reported it stopped</dt>
            <dd className="m-0 text-right font-mono tabular-nums text-warn">5.33 s</dd>
          </dl>
          <p className="m-0 border-t border-line pt-3 text-small leading-relaxed text-subtle">
            Experiment 1, Baseline, recorded 14 Nov 2026. Times from the start of the test caller’s clip.
          </p>
        </figure>
      </Feature>

      <Feature
        id="scoring"
        eyebrow="Scoring the practice call"
        title="A judge that has to show its work"
        intro={
          <>
            <p className="m-0">
              The judge answers in a fixed JSON schema. Then plain code applies the lab’s rules, because an LLM’s word isn’t
              evidence.
            </p>
            <p className="m-0">
              A point needs a quote that’s really in the call, matched word for word, ignoring punctuation and accents; its
              time comes from the transcript. A bluff counts only if it’s the seller’s own words. It zeroes technical honesty
              and fails the call, whatever the total.
            </p>
          </>
        }
      >
        <CodeBlock file="agent/src/prospect.py" note="matching a quote" lang="python" code={CODE.words} />
        <CodeBlock file="agent/src/prospect.py" note="a point needs evidence" lang="python" code={CODE.rules} />
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 font-mono text-xs">
            <span className="text-fg">agent/tests/test_prospect.py</span>
            <span className="font-bold text-ok">10 passed · no keys, no network</span>
          </div>
          <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-4 text-sm leading-normal sm:grid-cols-2">
            {TESTS.map((test) => (
              <li key={test} className="flex gap-2">
                <Icon name="check" className="mt-[3px] size-3.5 shrink-0 text-ok" strokeWidth={2} />
                {test}
              </li>
            ))}
          </ul>
        </div>
      </Feature>

      <Feature
        id="cost"
        eyebrow="Cost"
        title="A cheaper judge, after checking it agreed"
        intro={
          <>
            <p className="m-0">
              The judge started on gpt-5.5. Two saved calls were scored again by gpt-5.4-mini with low reasoning, twice each.
              Same verdicts, and every quote it gave was found in the transcript. It costs about a tenth as much, so it’s the
              judge now.
            </p>
            <p className="m-0">Speech runs on the lab’s own Deepgram key, so it doesn’t use up LiveKit’s free inference credits.</p>
          </>
        }
      >
        <figure className="m-0 flex flex-col gap-3.5 rounded-lg border border-line p-5">
          <figcaption className="eyebrow-sm text-subtle">Time to score a call</figcaption>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
            <span className="font-mono text-small text-subtle">gpt-5.5</span>
            <div className="relative h-3.5 rounded-full bg-fill">
              <span className="absolute inset-y-0 rounded-full bg-subtle" style={{ left: '64.3%', width: '28.6%' }} />
            </div>
            <span className="font-mono text-small text-fg">gpt-5.4-mini</span>
            <div className="relative h-3.5 rounded-full bg-fill">
              <span className="absolute inset-y-0 rounded-full bg-accent" style={{ left: '28.6%', width: '28.6%' }} />
            </div>
            <span />
            {/* Each tick at its own second on the 7-second axis the bars use. */}
            <div className="relative h-4 font-mono text-label text-subtle">
              {[0, 2, 4, 6, 7].map((s, i, all) => (
                <span
                  key={s}
                  className={`absolute top-0 ${i === 0 ? '' : i === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                  style={{ left: `${(s / 7) * 100}%` }}
                >
                  {i === 0 || i === all.length - 1 ? `${s} s` : s}
                </span>
              ))}
            </div>
          </div>
          <p className="m-0 text-sm">4.5 to 6.5 seconds before, 2 to 4 now.</p>
        </figure>
        <Scroller label="The cheaper judge’s scores" className="rounded-lg border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm leading-normal">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className={th}>Saved call</th>
                <th scope="col" className={th}>gpt-5.4-mini, run 1</th>
                <th scope="col" className={th}>Run 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-4 py-3 text-fg">Good discovery, honest answers, a dated next step</td>
                <td className="px-4 py-3">12 of 12, a pass</td>
                <td className="px-4 py-3">12 of 12, a pass</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-fg">The bluffing call</td>
                <td className="px-4 py-3">5 of 12; caught the guarantee</td>
                <td className="px-4 py-3">4 of 12; caught the same claim</td>
              </tr>
            </tbody>
          </table>
        </Scroller>
      </Feature>

      <Feature
        id="exposure"
        eyebrow="Exposure"
        title="A public demo that stays cheap"
        intro={
          <p className="m-0">
            The lab runs on free plans and lives at a link people are sent. So the Worker and the agent put limits on
            everything that costs money or leaks data.
          </p>
        }
      >
        <dl className="m-0 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {CONTROLS.map((control) => (
            <div key={control.name} className="flex flex-col gap-1 bg-page px-[18px] py-4">
              <dt className="text-card font-semibold text-fg">{control.name}</dt>
              <dd className="m-0 text-sm leading-relaxed">{control.text}</dd>
            </div>
          ))}
        </dl>
        <CodeBlock file="web/worker/index.ts" note="same length in, constant time" lang="ts" code={CODE.code} />
      </Feature>

      <Feature
        id="pilot"
        eyebrow="The pilot"
        title="Testing whether it teaches"
        intro={
          <>
            <p className="m-0">
              A participant’s link carries the access code and a pilot code. Nothing is recorded until they agree on the pilot
              page. Then it walks them through four steps: a check of five questions and three ratings, the lab, the practice
              call, and the same check again.
            </p>
            <p className="m-0">
              A participant’s calls carry the pilot code, so the agent records them for LiveKit Cloud’s Agent Insights.
              Everyone else’s calls aren’t recorded.
            </p>
          </>
        }
      >
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="eyebrow-sm m-0 text-subtle">What’s recorded, under the pilot code</p>
          <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 text-sm sm:grid-cols-2">
            {PILOT_RECORDS.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
          <p className="m-0 border-t border-line pt-3 text-sm leading-relaxed">
            A results page shows everything, one participant at a time. It takes an admin code, can delete a participant’s
            data, and can download it all as JSON.
          </p>
        </div>
      </Feature>

      <Feature
        id="limits"
        eyebrow="Known limits"
        title="What isn’t proven yet"
        intro={<p className="m-0">Next: run the pilot with two or three people who don’t know LiveKit, and fix what they get stuck on.</p>}
      >
        <ul className="m-0 flex list-none flex-col border-t border-line p-0">
          {LIMITS.map((limit) => (
            <li key={limit.text} className="flex gap-3 border-b border-line py-3.5 text-card leading-relaxed">
              <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${limit.warn ? 'bg-warn' : 'bg-subtle'}`} />
              <span>
                {/* The dot's colour says which kind it is; so do these words. */}
                <span className={limit.warn ? 'font-medium text-warn' : 'font-medium text-fg'}>
                  {limit.warn ? 'Unproven. ' : 'Known gap. '}
                </span>
                {limit.text}
              </span>
            </li>
          ))}
        </ul>
      </Feature>

      <p className="m-0 text-small leading-relaxed text-subtle">
        Every number on this page comes from the README’s live runs or the code. The excerpts are read from the source when the
        site is built. <ExternalLink href={REPO_URL}>Read the source on GitHub</ExternalLink>.
      </p>
    </main>
  );
}
