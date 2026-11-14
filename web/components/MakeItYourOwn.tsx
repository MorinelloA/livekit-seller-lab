'use client';

import { useState } from 'react';
import { type RunView, TurnList } from '@/components/ExperimentPanel';
import { Prediction } from '@/components/Prediction';
import { MAKE_IT_YOUR_OWN as copy } from '@/lib/experiments';
import { isTurn, type LabPersona, MAX_NAME_CHARS, MAX_RULE_CHARS } from '@/lib/protocol';

/** Rename the restaurant and add one house rule, then hear the difference. */
export function MakeItYourOwn(props: {
  persona: LabPersona | null;
  canAct: boolean;
  run: RunView;
  onApply: (name: string, rule: string) => Promise<void>;
  onRestore: () => Promise<void>;
  onPlayBooking: () => void;
  onLoad: () => Promise<void>;
  /** Called once, when the learner locks in a prediction. */
  onPredict?: (choice: string, correct: boolean) => void;
}) {
  const { persona, canAct, run } = props;
  const [choice, setChoice] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [name, setName] = useState('');
  const [rule, setRule] = useState('');

  const turns = run.events.filter(isTurn);
  const status = run.state?.status;
  const { prediction } = copy;
  const showAnswer = locked && (revealed || (applied && status === 'done'));

  const apply = async () => {
    await props.onApply(name.trim() || 'Juniper', rule.trim());
    setApplied(true);
  };

  const inputClass =
    'w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:bg-stone-50 disabled:text-stone-400';
  const secondaryButton =
    'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-40';

  return (
    <section className="space-y-6 rounded-2xl border border-stone-200 bg-white p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="text-stone-600">{copy.lead}</p>
      </div>

      <Prediction
        name="make-it-your-own"
        question={prediction.question}
        options={prediction.options}
        choice={choice}
        locked={locked}
        onChoose={setChoice}
        onLock={() => {
          setLocked(true);
          if (choice !== null) props.onPredict?.(prediction.options[choice], choice === prediction.expected);
        }}
      />

      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-semibold">Do this. </span>
          {copy.doThis}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Restaurant name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
              placeholder="Juniper"
              disabled={!locked}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Your rule</span>
            <input
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              maxLength={MAX_RULE_CHARS}
              placeholder={copy.suggestions[0]}
              disabled={!locked}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Suggested rules">
          {copy.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setRule(suggestion)}
              disabled={!locked}
              className="rounded-full border border-stone-300 px-2.5 py-1 text-xs hover:border-accent disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={!canAct || !locked}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Apply
          </button>
          <button type="button" onClick={props.onPlayBooking} disabled={!canAct || !applied} className={secondaryButton}>
            Play the test caller’s booking
          </button>
          {persona?.custom && (
            <button type="button" onClick={() => void props.onRestore()} disabled={!canAct} className={secondaryButton}>
              Back to the original Juniper
            </button>
          )}
        </div>
        {!locked && <p className="text-xs text-stone-500">Lock in a prediction first.</p>}
        <p className="text-sm text-stone-600" aria-live="polite">
          {!persona
            ? 'Call Juniper to start.'
            : persona.custom
              ? `Now answering as ${persona.name}.${persona.rule ? ` Your rule: “${persona.rule}”` : ''}`
              : 'Now answering as the original Juniper.'}
        </p>
        {(status || turns.length > 0) && (
          <div className="space-y-2 rounded-xl border border-stone-200 p-3" aria-live="polite">
            {status === 'running' && <p className="text-sm text-stone-500">The test caller is on the line…</p>}
            {status === 'failed' && <p className="text-sm text-amber-700">This run didn’t finish. Try it again.</p>}
            <TurnList turns={turns} />
          </div>
        )}
        <p className="text-xs text-stone-500">{copy.experimentsNote}</p>
      </div>

      <p className="text-sm text-stone-600">
        <span className="font-semibold text-stone-900">Notice. </span>
        {copy.notice}
      </p>

      {showAnswer ? (
        <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm">
          <p>
            <span className="font-semibold">Expected: </span>
            {prediction.options[prediction.expected]}.{' '}
            {choice === prediction.expected
              ? 'That’s what you predicted.'
              : `You predicted: ${prediction.options[choice ?? 0]}.`}
          </p>
          <p>{copy.answer}</p>
        </div>
      ) : (
        locked && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-sm font-medium text-accent underline underline-offset-4"
          >
            Show the answer now
          </button>
        )
      )}

      <details
        className="rounded-xl bg-stone-50 p-4 text-sm"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && !persona && canAct) void props.onLoad();
        }}
      >
        <summary className="cursor-pointer font-medium">See the instructions the LLM reads</summary>
        <pre className="mt-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-stone-700">
          {persona?.instructions ?? 'Call Juniper, then open this again to load them.'}
        </pre>
      </details>

      <p className="text-sm text-stone-600">{copy.fullProgram}</p>
    </section>
  );
}
