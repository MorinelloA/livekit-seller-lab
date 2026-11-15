'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { CHECK_QUESTIONS, CHECK_RATINGS, type CheckPhase, letter, RATING_LABELS } from '@/lib/check';

/** The five questions and three ratings, the same before and after the lab. */
export function KnowledgeCheck(props: {
  phase: CheckPhase;
  onSubmit: (answers: number[], ratings: number[], startedAt: number) => void;
}) {
  const { phase } = props;
  const [startedAt] = useState(() => Date.now());
  const [answers, setAnswers] = useState<number[]>(() => CHECK_QUESTIONS.map(() => -1));
  const [ratings, setRatings] = useState<number[]>(() => CHECK_RATINGS.map(() => 0));
  const missing = answers.filter((a) => a < 0).length + ratings.filter((r) => r === 0).length;

  const set = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        if (missing === 0) props.onSubmit(answers, ratings, startedAt);
      }}
    >
      <p className="m-0 text-base leading-relaxed">
        {phase === 'before'
          ? 'Five questions and three ratings, about two minutes. It’s fine not to know: this shows what the lab teaches. Pick the best answer without looking anything up.'
          : 'The same five questions and three ratings as before the lab. Answer them as you would now.'}
      </p>

      <ol className="m-0 flex list-none flex-col gap-7 p-0">
        {CHECK_QUESTIONS.map((q, qi) => (
          <li key={q.question}>
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[15px] leading-relaxed font-semibold text-fg">
                {qi + 1}. {q.question}
              </legend>
              {q.options.map((option, oi) => {
                const chosen = answers[qi] === oi;
                return (
                  <label
                    key={option}
                    className={cx(
                      'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3.5 py-2.5 text-sm leading-snug transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                      chosen ? 'border-accent-line bg-accent-soft text-fg' : 'border-line hover:border-subtle',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${phase}-q${qi}`}
                      checked={chosen}
                      onChange={() => setAnswers(set(answers, qi, oi))}
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                    />
                    <span>
                      <span className="font-mono text-subtle">({letter(oi)})</span> {option}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="display m-0 text-2xl">How sure are you?</h2>
          <p className="m-0 text-sm text-subtle">From 1 (not at all) to 5 (completely).</p>
        </div>
        {CHECK_RATINGS.map((statement, ri) => (
          <fieldset key={statement} className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-sm font-semibold text-fg">{statement}</legend>
            <div className="flex flex-wrap gap-2">
              {RATING_LABELS.map((label, i) => {
                const value = i + 1;
                const chosen = ratings[ri] === value;
                return (
                  <label
                    key={value}
                    className={cx(
                      // At least 44px wide too: "2", "3" and "4" were 37px, under the touch minimum.
                      'flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                      chosen ? 'border-accent-line bg-accent-soft text-fg' : 'border-line hover:border-subtle',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${phase}-r${ri}`}
                      checked={chosen}
                      onChange={() => setRatings(set(ratings, ri, value))}
                      className="sr-only"
                    />
                    <span className="font-mono font-bold tabular-nums">{value}</span>
                    {label && <span className="text-subtle">{label}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={missing > 0}>
          Submit my answers
        </Button>
        {missing > 0 && (
          <p className="m-0 text-sm text-subtle" aria-live="polite">
            {missing} still to answer.
          </p>
        )}
      </div>
    </form>
  );
}
