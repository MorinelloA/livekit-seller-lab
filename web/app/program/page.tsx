import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, Eyebrow, Pill } from '@/components/ui/Bits';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Scroller } from '@/components/ui/Scroller';
import { Feature, SectionHead } from '@/components/ui/Sections';
import { PASS_MARK, RUBRIC } from '@/lib/practice';
import { AUDIT, KEEP_CURRENT, LABS, LAB_SHAPE, METRICS, PATHS, ROLLOUT, TRACKS, type ProgramLab } from '@/lib/program';
import { AUTHOR } from '@/lib/site';

export const metadata: Metadata = {
  title: 'The program',
  description: 'A design for the technical training program Seller Lab 1 would belong to: the labs, certification and what gets measured.',
};

const th = 'border-b border-line px-5 py-3.5 eyebrow-sm text-subtle';
const PROPOSED = LABS.filter((lab) => lab.status === 'proposed');

function Status({ lab }: { lab: ProgramLab }) {
  return lab.status === 'built' ? <Pill tone="ok">Built</Pill> : <Pill>Proposed</Pill>;
}

/** A plain list of named rows, as the build page lists what it tuned. */
function Rows({ rows }: { rows: readonly { name: string; text: string }[] }) {
  return (
    <dl className="m-0 flex flex-col border-t border-line">
      {rows.map((row) => (
        <div key={row.name} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <dt className="text-card font-medium text-fg">{row.name}</dt>
          <dd className="m-0 text-card leading-reading">{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ProgramPage() {
  return (
    <main id="main" className="page-column">
      <section className="flex max-w-[820px] flex-col gap-5 pt-20 pb-16 sm:pt-24">
        <Eyebrow>The program · A design</Eyebrow>
        <h1 className="display m-0 text-page-title leading-page">One lab is built. This is the program around it.</h1>
        <p className="m-0 text-lead leading-reading tracking-body [text-wrap:pretty]">
          One lab doesn’t get sellers ready for a technical customer conversation. A program can, without pulling
          engineers off the roadmap to do it. This page is how I’d build one: what to find out first, the labs, how a
          seller is certified, and what gets measured.
        </p>
        <Callout tone="info" role="note">
          A design by {AUTHOR.name}, not LiveKit’s plan. It was written without seeing LiveKit’s deals, its sellers or its
          training, so its first step is to go and look. Only <Link href="/lab/" className="text-accent underline-offset-2 hover:underline">Lab 1</Link>{' '}
          exists. Everything marked Proposed is a plan.
        </Callout>
      </section>

      <Feature
        id="audit"
        eyebrow="Before anything else"
        title="Find where deals stall"
        intro={
          <>
            <p className="m-0">
              The program starts with listening. A curriculum written before that teaches what its author finds
              interesting, which is rarely what loses deals.
            </p>
            <p className="m-0">
              What comes out is a ranked list of gaps. It sets the order of the labs below, and I’d expect it to change
              that order.
            </p>
          </>
        }
      >
        <Rows rows={AUDIT} />
      </Feature>

      <section id="labs" aria-labelledby="labs-title" className="flex scroll-mt-6 flex-col gap-8 pb-24">
        <SectionHead eyebrow="The curriculum" id="labs-title" title="Six labs, each answering something a customer says" />
        <div className="flex max-w-[760px] flex-col gap-3.5 text-base leading-reading">
          <p className="m-0">
            The labs cover four areas: LiveKit fundamentals, voice AI architecture, agents and the competitive landscape.
            Each lab starts from a sentence a seller will hear on a call and ends with the question to ask back.
          </p>
          <p className="m-0">
            The last one is the hardest to write from outside: the named comparisons need LiveKit’s product team behind
            them, and a seller should leave it able to say where LiveKit is the wrong choice.
          </p>
        </div>
        <Scroller label="The six labs" className="rounded-lg border border-line">
          <table className="w-full min-w-[640px] border-collapse text-left text-card leading-relaxed">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className={th}>Lab</th>
                <th scope="col" className={th}>Area</th>
                <th scope="col" className={th}>The customer says</th>
                <th scope="col" className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {LABS.map((lab) => (
                <tr key={lab.number}>
                  <th scope="row" className="px-5 py-4 align-top font-medium text-fg">
                    <span className="block font-mono text-small font-normal text-subtle">Lab {lab.number}</span>
                    {lab.href ? (
                      <Link href={lab.href} className="text-accent underline-offset-2 hover:underline">
                        {lab.title}
                      </Link>
                    ) : (
                      lab.title
                    )}
                  </th>
                  <td className="px-5 py-4 align-top">{TRACKS[lab.track]}</td>
                  <td className="px-5 py-4 align-top">{lab.customerSays}</td>
                  <td className="px-5 py-4 align-top">
                    <Status lab={lab} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </section>

      <Feature
        id="shape"
        eyebrow="How a lab works"
        title="Every lab has Lab 1’s six parts"
        intro={
          <>
            <p className="m-0">
              Slides tell a seller that turn detection matters. Hearing an agent talk over a caller, having just bet that
              it wouldn’t, is what makes it stick.
            </p>
            <p className="m-0">So the shape doesn’t change from lab to lab. Only the subject does.</p>
          </>
        }
      >
        <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {LAB_SHAPE.map((part, i) => (
            <li key={part.name} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
              <span className="eyebrow-sm text-subtle">
                {i + 1} · {part.name}
              </span>
              <p className="m-0 text-card leading-reading">{part.why}</p>
              <Link href={part.href} className="hit mt-auto inline-flex items-center gap-1.5 self-start text-small text-accent underline-offset-2 hover:underline">
                See it in Lab 1
                <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />
              </Link>
            </li>
          ))}
        </ol>
      </Feature>

      <section id="proposed" aria-labelledby="proposed-title" className="flex scroll-mt-6 flex-col gap-8 pb-24">
        <SectionHead eyebrow="Labs 2 to 6" id="proposed-title" title="What the five proposed labs would hold" />
        <div className="grid gap-4 lg:grid-cols-2">
        {PROPOSED.map((lab) => (
          <article key={lab.number} aria-labelledby={`lab-${lab.number}`} className="flex flex-col gap-4 rounded-lg border border-line p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 id={`lab-${lab.number}`} className="m-0 text-lead font-medium text-fg">
                Lab {lab.number}: {lab.title}
              </h3>
              <Status lab={lab} />
            </div>
            <dl className="m-0 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {(
                [
                  ['Predict', lab.predict],
                  ['Hear it', lab.hear],
                  ['Try it', lab.tryIt],
                  ['Ask this', lab.askThis],
                  ['Check', lab.check],
                  ['Practice call', lab.practice],
                ] as const
              ).map(([label, text]) => (
                <div key={label} className="flex flex-col gap-1">
                  <Eyebrow as="dt" size="sm">
                    {label}
                  </Eyebrow>
                  <dd className="m-0 text-card leading-reading">{text}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        </div>
      </section>

      <Feature
        id="paths"
        eyebrow="Who takes what"
        title="Two paths through the same labs"
        intro={
          <p className="m-0">
            A Solutions Architect who has only read the code explains a dropped turn in terms of thresholds. One who has
            also sat through the seller’s labs explains it in terms of a caller reading out an account number. I want the
            second kind.
          </p>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {PATHS.map((path) => (
            <article key={path.who} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
              <h3 className="m-0 text-title font-normal tracking-title text-fg">{path.who}</h3>
              <p className="m-0 text-card leading-reading">{path.goal}</p>
              <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-card leading-reading marker:font-mono marker:text-small marker:text-subtle">
                {path.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </Feature>

      <Feature
        id="certification"
        eyebrow="Certification"
        title="Ready means you’ve done it out loud"
        intro={
          <>
            <p className="m-0">
              A quiz can’t certify this. A seller who picks the right letter can still freeze when a CTO asks whether
              they could self-host.
            </p>
            <p className="m-0">
              So both certifications are things done out loud, and both are scored the same way: a point needs a moment
              in the recording that earned it.
            </p>
          </>
        }
      >
        <article className="flex flex-col gap-4 rounded-lg border border-line p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="m-0 text-lead font-medium text-fg">Discovery: the practice call</h3>
            <Pill tone="ok">Built</Pill>
          </div>
          <p className="m-0 text-card leading-reading">
            Eight to ten minutes with an AI prospect. A pass is {PASS_MARK} of {RUBRIC.length * 2} points with no made-up
            answers; one bluff fails the call, whatever the total.
          </p>
          <ol className="m-0 grid list-none gap-x-8 gap-y-2 p-0 sm:grid-cols-2">
            {RUBRIC.map((item) => (
              <li key={item.id} className="flex gap-2.5 text-card leading-reading">
                <span className="font-mono text-small text-subtle">{item.id}</span>
                {item.title}
              </li>
            ))}
          </ol>
          <div>
            <ButtonLink href="/practice/" variant="quiet">
              See the practice call
              <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />
            </ButtonLink>
          </div>
        </article>
        <article className="flex flex-col gap-4 rounded-lg border border-line p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="m-0 text-lead font-medium text-fg">Demo: change a setting live</h3>
            <Pill>Proposed</Pill>
          </div>
          <p className="m-0 text-card leading-reading">
            The seller runs Juniper for a colleague playing the customer, switches one setting in the middle of the call,
            and says what changed and why that customer should care. The lab already switches settings on a live call, so
            the demo needs a script and a rubric, not new software.
          </p>
        </article>
      </Feature>

      <Feature
        id="current"
        eyebrow="Every release"
        title="Keeping it true after LiveKit ships"
        intro={
          <>
            <p className="m-0">
              Training goes stale quietly. LiveKit’s docs now mark its text-based turn detector as deprecated in favour of
              the audio one; a lab written a year ago would still be teaching the old one, and nobody would have been told.
            </p>
            <p className="m-0">Lab 1 is built so that going stale makes a test fail.</p>
          </>
        }
      >
        <Rows rows={KEEP_CURRENT} />
      </Feature>

      <Feature
        id="measures"
        eyebrow="What gets measured"
        title="Four measures, and what Lab 1 records today"
        intro={
          <>
            <p className="m-0">
              Two of the four can be read off the lab now. The other two need a sales team’s own systems, and I’d rather
              say so than pass off a stand-in as the real thing.
            </p>
            <p className="m-0">
              So far the only data is one run of my own: 2 of 5 on the check before the lab, 5 of 5 after. That shows the
              recording works and nothing else. A pilot with two or three people who don’t know LiveKit comes next.
            </p>
          </>
        }
      >
        <Scroller label="The four measures" className="rounded-lg border border-line">
          <table className="w-full min-w-[520px] border-collapse text-left text-card leading-relaxed">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className={th}>Measure</th>
                <th scope="col" className={th}>Recorded today</th>
                <th scope="col" className={th}>Still needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {METRICS.map((row) => (
                <tr key={row.metric}>
                  <th scope="row" className="w-[26%] px-5 py-4 align-top font-medium text-fg">
                    {row.metric}
                  </th>
                  <td className="px-5 py-4 align-top">{row.recordedToday}</td>
                  <td className="px-5 py-4 align-top">{row.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <div>
          <ButtonLink href="/build/#pilot" variant="quiet">
            How the pilot records it
            <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />
          </ButtonLink>
        </div>
      </Feature>

      <Feature
        id="rollout"
        eyebrow="Getting started"
        title="Rolling it out over three months"
        intro={
          <p className="m-0">
            Rough, and the audit will move it. But Lab 1 can go in front of new sellers on day one, because it’s already
            running.
          </p>
        }
      >
        <ol className="m-0 flex list-none flex-col border-t border-line p-0">
          {ROLLOUT.map((stage) => (
            <li key={stage.when} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <span className="font-mono text-small text-subtle">{stage.when}</span>
              <span className="text-card leading-reading">{stage.text}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/lab/" variant="primary" size="stack">
            Start with Lab 1
            <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />
          </ButtonLink>
          <ButtonLink href="/build/" size="stack">
            How it’s built
          </ButtonLink>
        </div>
      </Feature>
    </main>
  );
}
