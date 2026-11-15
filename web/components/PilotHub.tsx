'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { KnowledgeCheck } from '@/components/KnowledgeCheck';
import { Eyebrow } from '@/components/ui/Bits';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { CHECK_QUESTIONS, checkScore, type CheckPhase, letter } from '@/lib/check';
import {
  type CheckAnswers,
  currentStep,
  logPilot,
  type Progress,
  reachStep,
  readChecks,
  readProgress,
  saveCheck,
  type Step,
  STEP_LABEL,
} from '@/lib/pilot';
import { useLabAccess } from '@/lib/useLabAccess';
import { Scroller } from '@/components/ui/Scroller';

const NUMBERED: { step: Step; label: string }[] = [
  { step: 'before', label: 'The check before the lab' },
  { step: 'lab', label: 'The lab' },
  { step: 'practice', label: 'The practice call' },
  { step: 'after', label: 'The check after the lab' },
];

const MAIN = 'mx-auto flex max-w-[840px] flex-col gap-10 px-5 pt-14 sm:px-10 sm:pt-16';

/** The pilot participant's home: consent, then the four steps in order. */
export function PilotHub() {
  const { ready, pilot } = useLabAccess();
  const [progress, setProgress] = useState<Progress>({});
  const [checks, setChecks] = useState<Partial<Record<CheckPhase, CheckAnswers>>>({});

  useEffect(() => {
    if (!ready) return;
    setProgress(readProgress());
    setChecks(readChecks());
  }, [ready, pilot]);

  const step = currentStep(progress);
  const stepName = step === 'consent' ? 'Consent' : step === 'done' ? 'Done' : STEP_LABEL[step].replace(/\.$/, '');

  // Each step titles the page, so a participant (and a screen reader) knows where they are.
  // Next writes the page's own title into the head after hydration, so it's put back if so.
  useEffect(() => {
    if (!ready) return;
    const title = `${stepName} · Pilot · Seller Lab`;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [ready, stepName]);

  // The page's main area exists from the first paint, so the skip link has its target
  // before the participant's progress is read from this browser.
  if (!ready) return <main id="main" className={MAIN} />;

  const submit = (phase: CheckPhase) => (answers: number[], ratings: number[], startedAt: number) => {
    logPilot({ kind: 'check', phase, answers, ratings, startedAt });
    saveCheck(phase, { answers, ratings });
    setChecks(readChecks());
    setProgress(reachStep(phase === 'before' ? 'lab' : 'done'));
    window.scrollTo({ top: 0 });
  };

  return (
    <main id="main" className={MAIN}>
      <header className="flex flex-col gap-4">
        <Eyebrow>Seller Lab 1 · Pilot{pilot ? ` · ${pilot}` : ''}</Eyebrow>
        <h1 className="display text-page-title leading-page">
          {step === 'before' || step === 'after' ? 'Quick check' : 'Trying out Seller Lab 1'}
        </h1>
      </header>

      {!pilot ? (
        <p className="m-0 text-base leading-relaxed">
          This page is for people helping Tony try out the lab. Open the link he sent you, and it brings you here with
          your pilot code.
        </p>
      ) : (
        <>
          {step !== 'consent' && <StepList step={step} />}
          {step === 'consent' && (
            <Consent
              pilot={pilot}
              onAgree={() => {
                reachStep('consent');
                setProgress(reachStep('before'));
              }}
            />
          )}
          {step === 'before' && <KnowledgeCheck phase="before" onSubmit={submit('before')} />}
          {step === 'lab' && (
            <NextStep
              title="Step 2: the lab"
              href="/lab/"
              linkText="Open the lab"
              doneText="I’ve finished the lab"
              onDone={() => setProgress(reachStep('practice'))}
            >
              Call Juniper, then work through Make it your own and all four experiments, top to bottom. Use headphones.
              When you’re done, press the link in the bar at the top of the lab. It takes about 30 minutes.
            </NextStep>
          )}
          {step === 'practice' && (
            <NextStep
              title="Step 3: the practice call"
              href="/practice/"
              linkText="Open the practice call"
              doneText="I’ve finished the practice call"
              onDone={() => setProgress(reachStep('after'))}
            >
              Read the brief, then call Priya. The call takes 8 to 10 minutes, and a coach scores it when you end it.
              Call again if you’d like another try.
            </NextStep>
          )}
          {step === 'after' && <KnowledgeCheck phase="after" onSubmit={submit('after')} />}
          {step === 'done' && <Done checks={checks} />}
        </>
      )}
    </main>
  );
}

function StepList({ step }: { step: Step }) {
  const order: Step[] = ['before', 'lab', 'practice', 'after', 'done'];
  return (
    <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-4" aria-label="Steps">
      {NUMBERED.map((item, i) => {
        const done = order.indexOf(step) > order.indexOf(item.step);
        const now = item.step === step;
        return (
          <li
            key={item.step}
            aria-current={now ? 'step' : undefined}
            className={cx(
              'flex flex-col gap-1 rounded-md border px-3.5 py-3 text-sm',
              now ? 'border-accent-line bg-accent-soft text-fg' : 'border-line text-subtle',
            )}
          >
            <span className="flex items-center gap-1.5 font-mono text-label tracking-pill uppercase">
              {done && <Icon name="check" className="size-3.5 text-accent" strokeWidth={2} />}
              Step {i + 1}
              {done ? ' · done' : ''}
            </span>
            <span className={now ? 'font-semibold' : undefined}>{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Consent({ pilot, onAgree }: { pilot: string; onAgree: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <section className="flex flex-col gap-5 text-base leading-relaxed">
      <p className="m-0">
        Thanks for helping, {pilot}. Seller Lab 1 teaches new LiveKit sellers why voice AI agents are hard to get right,
        and how to ask a prospect about it. You’ll go through four steps, about 50 minutes in all:
      </p>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-6">
        <li>A quick check: five questions and three ratings.</li>
        <li>The lab, with Juniper, a voice agent for a made-up restaurant.</li>
        <li>A practice call with Priya, an AI playing a prospect, scored by a coach.</li>
        <li>The same quick check again.</li>
      </ol>
      <p className="m-0">
        You need Chrome or Edge on a laptop, headphones with a microphone, and a quiet room. It’s fine to get stuck:
        that’s what the pilot is for. Say what you’re thinking as you go, if Tony is with you.
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5 text-sm leading-relaxed">
        <p className="m-0 font-semibold text-fg">What’s recorded</p>
        <p className="m-0">
          Your answers, how long each step takes, what you predict and play in the lab, and the audio and transcripts of
          your calls with Juniper and Priya. They’re filed under your pilot code, not your name. Tony uses them to
          improve the lab and to report how the pilot went, without your name. Ask him to delete them at any time.
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="size-4 accent-accent"
        />
        I agree to this being recorded.
      </label>
      <div>
        <Button variant="primary" onClick={onAgree} disabled={!agreed}>
          Start step 1
        </Button>
      </div>
    </section>
  );
}

function NextStep(props: {
  title: string;
  href: string;
  linkText: string;
  doneText: string;
  onDone: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <h2 className="display m-0 text-2xl">{props.title}</h2>
      <p className="m-0 text-base leading-relaxed">{props.children}</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={props.href} variant="primary">
          {props.linkText}
        </ButtonLink>
        <Button onClick={props.onDone}>{props.doneText}</Button>
      </div>
    </section>
  );
}

function Done({ checks }: { checks: Partial<Record<CheckPhase, CheckAnswers>> }) {
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const before = checks.before?.answers ?? [];
  const after = checks.after?.answers ?? [];
  const mark = (answers: number[], qi: number) =>
    answers[qi] === undefined ? '–' : `${letter(answers[qi])} ${answers[qi] === CHECK_QUESTIONS[qi].answer ? '✓' : '✗'}`;
  const th = 'px-3 py-2.5 font-mono text-label font-bold tracking-pill uppercase text-subtle';

  return (
    <section className="flex flex-col gap-7">
      <p className="m-0 text-lg text-fg">That’s everything. Thank you!</p>
      {checks.before && checks.after && (
        <div className="flex flex-col gap-3">
          <h2 className="display m-0 text-2xl">Your answers</h2>
          <p className="m-0 text-sm">
            Before the lab you got {checkScore(before)} of {CHECK_QUESTIONS.length}; after it, {checkScore(after)}.
          </p>
          <Scroller label="Your answers" className="rounded-lg border border-line">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-line bg-surface">
                <tr>
                  <th scope="col" className={th}>Question</th>
                  <th scope="col" className={th}>Before</th>
                  <th scope="col" className={th}>After</th>
                  <th scope="col" className={th}>Answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {CHECK_QUESTIONS.map((q, qi) => (
                  <tr key={q.question}>
                    <td className="px-3 py-2.5">{q.question}</td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap text-fg">{mark(before, qi)}</td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap text-fg">{mark(after, qi)}</td>
                    <td className="px-3 py-2.5">
                      ({letter(q.answer)}) {q.options[q.answer]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        </div>
      )}
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!feedback.trim()) return;
          logPilot({ kind: 'feedback', text: feedback.trim().slice(0, 2000) });
          setSent(true);
        }}
      >
        <label htmlFor="feedback" className="font-semibold text-fg">
          Anything confusing, or anything you’d change? (optional)
        </label>
        <TextArea
          id="feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={2000}
          rows={4}
          disabled={sent}
        />
        {sent ? (
          <p className="m-0 text-sm text-subtle">Sent. Thanks.</p>
        ) : (
          <div>
            <Button type="submit" disabled={!feedback.trim()}>
              Send
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
