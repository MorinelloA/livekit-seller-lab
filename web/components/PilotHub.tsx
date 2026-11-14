'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { KnowledgeCheck } from '@/components/KnowledgeCheck';
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
} from '@/lib/pilot';
import { useLabAccess } from '@/lib/useLabAccess';

const NUMBERED: { step: Step; label: string }[] = [
  { step: 'before', label: 'The check before the lab' },
  { step: 'lab', label: 'The lab' },
  { step: 'practice', label: 'The practice call' },
  { step: 'after', label: 'The check after the lab' },
];

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

  if (!ready) return null;

  const step = currentStep(progress);
  const submit = (phase: CheckPhase) => (answers: number[], ratings: number[], startedAt: number) => {
    logPilot({ kind: 'check', phase, answers, ratings, startedAt });
    saveCheck(phase, { answers, ratings });
    setChecks(readChecks());
    setProgress(reachStep(phase === 'before' ? 'lab' : 'done'));
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          <Link href="/" className="hover:underline">
            Seller Lab 1
          </Link>{' '}
          · Pilot{pilot ? ` · ${pilot}` : ''}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {step === 'before' || step === 'after' ? 'Quick check' : 'Trying out Seller Lab 1'}
        </h1>
      </header>

      {!pilot ? (
        <p className="text-stone-700">
          This page is for people helping Tony try out the lab. Open the link he sent you, and it
          brings you here with your pilot code.
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
              href="/"
              linkText="Open the lab"
              doneText="I’ve finished the lab"
              onDone={() => setProgress(reachStep('practice'))}
            >
              Call Juniper, then work through Make it your own and all four experiments, top to bottom.
              Use headphones. When you’re done, press the link in the blue bar at the top of the lab.
              It takes about 30 minutes.
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
              Read the brief, then call Priya. The call takes 8 to 10 minutes, and a coach scores it
              when you end it. Call again if you’d like another try.
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
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Steps">
      {NUMBERED.map((item, i) => {
        const done = order.indexOf(step) > order.indexOf(item.step);
        const now = item.step === step;
        return (
          <li
            key={item.step}
            aria-current={now ? 'step' : undefined}
            className={`rounded-lg border px-3 py-2 text-sm ${
              now ? 'border-accent bg-accent-soft font-medium' : 'border-stone-200 bg-white text-stone-600'
            }`}
          >
            <span className="block text-xs text-stone-500">
              Step {i + 1}
              {done ? ' · done' : ''}
            </span>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
}

function Consent({ pilot, onAgree }: { pilot: string; onAgree: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <section className="space-y-5">
      <p className="text-stone-700">
        Thanks for helping, {pilot}. Seller Lab 1 teaches new LiveKit sellers why voice AI agents are
        hard to get right, and how to ask a prospect about it. You’ll go through four steps, about 50
        minutes in all:
      </p>
      <ol className="list-decimal space-y-1 pl-6 text-stone-700">
        <li>A quick check: five questions and three ratings.</li>
        <li>The lab, with Juniper, a voice agent for a made-up restaurant.</li>
        <li>A practice call with Priya, an AI playing a prospect, scored by a coach.</li>
        <li>The same quick check again.</li>
      </ol>
      <p className="text-stone-700">
        You need Chrome or Edge on a laptop, headphones with a microphone, and a quiet room. It’s fine
        to get stuck: that’s what the pilot is for. Say what you’re thinking as you go, if Tony is
        with you.
      </p>
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
        <p className="font-medium text-stone-900">What’s recorded</p>
        <p>
          Your answers, how long each step takes, what you predict and play in the lab, and the audio
          and transcripts of your calls with Juniper and Priya. They’re filed under your pilot code,
          not your name. Tony uses them to improve the lab and to report how the pilot went, without
          your name. Ask him to delete them at any time.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 accent-accent"
        />
        I agree to this being recorded.
      </label>
      <button
        type="button"
        onClick={onAgree}
        disabled={!agreed}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Start step 1
      </button>
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
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-xl font-semibold">{props.title}</h2>
      <p className="text-stone-700">{props.children}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={props.href} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          {props.linkText}
        </Link>
        <button
          type="button"
          onClick={props.onDone}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium"
        >
          {props.doneText}
        </button>
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

  return (
    <section className="space-y-6">
      <p className="text-lg text-stone-800">That’s everything. Thank you!</p>
      {checks.before && checks.after && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Your answers</h2>
          <p className="text-sm text-stone-600">
            Before the lab you got {checkScore(before)} of {CHECK_QUESTIONS.length}; after it,{' '}
            {checkScore(after)}.
          </p>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Question</th>
                  <th scope="col" className="px-3 py-2 font-medium">Before</th>
                  <th scope="col" className="px-3 py-2 font-medium">After</th>
                  <th scope="col" className="px-3 py-2 font-medium">Answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {CHECK_QUESTIONS.map((q, qi) => (
                  <tr key={q.question}>
                    <td className="px-3 py-2 text-stone-700">{q.question}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{mark(before, qi)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{mark(after, qi)}</td>
                    <td className="px-3 py-2 text-stone-700">
                      ({letter(q.answer)}) {q.options[q.answer]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!feedback.trim()) return;
          logPilot({ kind: 'feedback', text: feedback.trim().slice(0, 2000) });
          setSent(true);
        }}
      >
        <label htmlFor="feedback" className="block font-medium">
          Anything confusing, or anything you’d change? (optional)
        </label>
        <textarea
          id="feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={2000}
          rows={4}
          disabled={sent}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-50"
        />
        {sent ? (
          <p className="text-sm text-stone-600">Sent. Thanks.</p>
        ) : (
          <button
            type="submit"
            disabled={!feedback.trim()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </section>
  );
}
