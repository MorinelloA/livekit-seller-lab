'use client';

import { useState } from 'react';
import { ConversationTimeline, TimelineLegend } from '@/components/ConversationTimeline';
import { type RunView, TurnList } from '@/components/ExperimentPanel';
import { Prediction } from '@/components/Prediction';
import { Eyebrow, inputClass } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { MAKE_IT_YOUR_OWN as copy } from '@/lib/experiments';
import { isTurn, type LabPersona, MAX_NAME_CHARS, MAX_RULE_CHARS } from '@/lib/protocol';
import { TIMELINE_SECONDS } from '@/lib/timeline';

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

  return (
    <section
      id="make-it-your-own"
      aria-labelledby="make-it-your-own-title"
      className="scroll-mt-6 rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-col gap-3 px-5 pt-7 pb-6 sm:px-7">
        <Eyebrow className="text-[11px]">Start here</Eyebrow>
        <h2 id="make-it-your-own-title" className="display text-[30px] leading-[1.15]">
          {copy.title}
        </h2>
        <p className="max-w-[680px] text-base leading-[1.7]">{copy.lead}</p>
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 sm:px-7">
        <Eyebrow as="span" className="text-[11px]">
          Predict
        </Eyebrow>
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
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 sm:px-7">
        <Eyebrow as="span" className="text-[11px]">
          Do this
        </Eyebrow>
        <p className="m-0 text-[15px] leading-relaxed">{copy.doThis}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-fg">
            Restaurant name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
              placeholder="Juniper"
              disabled={!locked}
              className={cx(inputClass, 'font-normal')}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-fg">
            Your rule
            <input
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              maxLength={MAX_RULE_CHARS}
              placeholder={copy.suggestions[0]}
              disabled={!locked}
              className={cx(inputClass, 'font-normal')}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested rules">
          {copy.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setRule(suggestion)}
              disabled={!locked}
              className="min-h-9 rounded-full border border-line px-3 text-xs text-body transition-colors hover:border-subtle hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void apply()} disabled={!canAct || !locked}>
            Apply
          </Button>
          <Button onClick={props.onPlayBooking} disabled={!canAct || !applied}>
            <Icon name="play" className="size-3" />
            Play the test caller’s booking
          </Button>
          {persona?.custom && (
            <Button onClick={() => void props.onRestore()} disabled={!canAct}>
              Back to the original Juniper
            </Button>
          )}
        </div>
        {!locked && <p className="m-0 text-[13px] text-subtle">Lock in a prediction first.</p>}
        <p className="m-0 text-sm" aria-live="polite">
          {!persona
            ? 'Call Juniper to start.'
            : persona.custom
              ? `Now answering as ${persona.name}.${persona.rule ? ` Your rule: “${persona.rule}”` : ''}`
              : 'Now answering as the original Juniper.'}
        </p>
        {(status || turns.length > 0) && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-page p-4" aria-live="polite">
            {run.timeline && run.state && (
              <>
                <ConversationTimeline
                  runs={[
                    {
                      key: run.state.id,
                      label: persona?.custom ? persona.name : 'Juniper',
                      tone: 'enhanced',
                      timeline: run.timeline,
                      events: run.events,
                    },
                  ]}
                  minSeconds={TIMELINE_SECONDS[0]}
                  title="The test caller’s booking"
                />
                <TimelineLegend />
              </>
            )}
            {status === 'running' && <p className="m-0 text-sm text-subtle">The test caller is on the line…</p>}
            {status === 'failed' && <p className="m-0 text-sm text-warn">This run didn’t finish. Try it again.</p>}
            <TurnList turns={turns} />
          </div>
        )}
        <p className="m-0 text-[13px] text-subtle">{copy.experimentsNote}</p>
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 sm:px-7">
        <p className="m-0 text-sm leading-relaxed">
          <span className="font-semibold text-fg">Notice. </span>
          {copy.notice}
        </p>
        {showAnswer ? (
          <div className="flex flex-col gap-2 rounded-md border border-accent-line bg-accent-soft p-4 text-sm leading-relaxed text-fg">
            <p className="m-0">
              <span className="font-semibold">Expected: </span>
              {prediction.options[prediction.expected]}.{' '}
              {choice === prediction.expected
                ? 'That’s what you predicted.'
                : `You predicted: ${prediction.options[choice ?? 0]}.`}
            </p>
            <p className="m-0 text-body">{copy.answer}</p>
          </div>
        ) : (
          locked && (
            <div>
              <Button variant="quiet" onClick={() => setRevealed(true)}>
                Show the answer now
              </Button>
            </div>
          )
        )}
        <details
          className="group rounded-md border border-line bg-page"
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open && !persona && canAct) void props.onLoad();
          }}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <Icon name="arrow" className="size-3.5 text-subtle transition-transform group-open:rotate-90" />
            See the instructions the LLM reads
          </summary>
          <pre className="m-0 border-t border-line px-4 py-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-body">
            {persona?.instructions ?? 'Call Juniper, then open this again to load them.'}
          </pre>
        </details>
        <p className="m-0 text-sm leading-relaxed text-subtle">{copy.fullProgram}</p>
      </div>
    </section>
  );
}
