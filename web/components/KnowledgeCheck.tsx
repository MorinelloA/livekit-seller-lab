'use client';

import { useState } from 'react';
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
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (missing === 0) props.onSubmit(answers, ratings, startedAt);
      }}
    >
      <p className="text-stone-600">
        {phase === 'before'
          ? 'Five questions and three ratings, about two minutes. It’s fine not to know: this shows what the lab teaches. Pick the best answer without looking anything up.'
          : 'The same five questions and three ratings as before the lab. Answer them as you would now.'}
      </p>

      <ol className="space-y-6">
        {CHECK_QUESTIONS.map((q, qi) => (
          <li key={q.question}>
            <fieldset className="space-y-2">
              <legend className="font-medium">
                {qi + 1}. {q.question}
              </legend>
              {q.options.map((option, oi) => (
                <label key={option} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${phase}-q${qi}`}
                    checked={answers[qi] === oi}
                    onChange={() => setAnswers(set(answers, qi, oi))}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="text-stone-500">({letter(oi)})</span> {option}
                  </span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How sure are you?</h2>
        <p className="text-sm text-stone-600">From 1 (not at all) to 5 (completely).</p>
        {CHECK_RATINGS.map((statement, ri) => (
          <fieldset key={statement} className="space-y-2">
            <legend className="text-sm font-medium">{statement}</legend>
            <div className="flex flex-wrap gap-2">
              {RATING_LABELS.map((label, i) => {
                const value = i + 1;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                      ratings[ri] === value ? 'border-accent bg-accent-soft' : 'border-stone-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${phase}-r${ri}`}
                      checked={ratings[ri] === value}
                      onChange={() => setRatings(set(ratings, ri, value))}
                      className="sr-only"
                    />
                    <span className="font-medium tabular-nums">{value}</span>
                    {label && <span className="text-stone-500">{label}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={missing > 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Submit my answers
        </button>
        {missing > 0 && (
          <p className="text-sm text-stone-500" aria-live="polite">
            {missing} still to answer.
          </p>
        )}
      </div>
    </form>
  );
}
