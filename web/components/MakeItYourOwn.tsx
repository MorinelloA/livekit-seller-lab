'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationTimeline, TimelineLegend } from '@/components/ConversationTimeline';
import { type RunView, TurnList } from '@/components/ExperimentPanel';
import { Prediction } from '@/components/Prediction';
import { Eyebrow } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Field, WrappingInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { MAKE_IT_YOUR_OWN as copy } from '@/lib/experiments';
import { isTurn, type LabPersona, MAX_NAME_CHARS, MAX_RULE_CHARS } from '@/lib/protocol';
import { TIMELINE_SECONDS } from '@/lib/timeline';

/** Rename the restaurant and add one house rule, then hear the difference. */
export function MakeItYourOwn(props: {
  persona: LabPersona | null;
  canAct: boolean;
  run: RunView;
  /** Resolves to whether Juniper took the new name and rule. */
  onApply: (name: string, rule: string) => Promise<boolean>;
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

  // "Show the answer now" goes away when the answer opens, so focus moves to the answer.
  const answerRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);
  // "Back to the original Juniper" goes away once it worked, so focus moves to the status line.
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [applied, setApplied] = useState(false);
  const [name, setName] = useState('');
  const [rule, setRule] = useState('');

  const turns = run.events.filter(isTurn);
  // The run's own turns say which restaurant Juniper was playing; the persona may have
  // changed since (every experiment run resets it).
  const ranAs = turns.find((t) => t.agent)?.agent ?? (persona?.custom ? persona.name : 'Juniper');
  const status = run.state?.status;
  const { prediction } = copy;
  const showAnswer = locked && (revealed || (applied && status === 'done'));

  const apply = async () => {
    // Only a change Juniper took counts: the booking and the answer wait for it.
    if (await props.onApply(name.trim() || 'Juniper', rule.trim())) setApplied(true);
  };

  return (
    <section
      id="make-it-your-own"
      aria-labelledby="make-it-your-own-title"
      className="scroll-mt-6 rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-col gap-3 px-5 pt-7 pb-6 sm:px-7">
        <Eyebrow size="sm">Start here</Eyebrow>
        <h2 id="make-it-your-own-title" className="display text-heading leading-heading">
          {copy.title}
        </h2>
        <p className="max-w-[680px] text-base leading-reading">{copy.lead}</p>
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 sm:px-7">
        <Eyebrow as="span" size="sm">
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
        <Eyebrow as="span" size="sm">
          Do this
        </Eyebrow>
        <p className="m-0 text-card leading-relaxed">{copy.doThis}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="miyo-name" label="Restaurant name">
            {/* Both fields wrap instead of hiding the end of a long name or rule on a phone. */}
            <WrappingInput
              id="miyo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
              placeholder="Juniper"
              disabled={!locked}
            />
          </Field>
          <Field id="miyo-rule" label="Your rule">
            <WrappingInput
              id="miyo-rule"
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              maxLength={MAX_RULE_CHARS}
              placeholder={copy.suggestions[0]}
              disabled={!locked}
            />
          </Field>
        </div>
        {/* 12px between wrapped rows, so each 36px chip's 44px touch area has clear space around it. */}
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Suggested rules">
          {copy.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setRule(suggestion)}
              disabled={!locked}
              className="hit min-h-9 max-w-full rounded-full border border-line px-3 py-1.5 text-xs text-body transition-colors hover:border-subtle hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
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
            <Button
              onClick={async () => {
                await props.onRestore();
                statusRef.current?.focus();
              }}
              disabled={!canAct}
            >
              Back to the original Juniper
            </Button>
          )}
        </div>
        {!locked && <p className="m-0 text-small text-subtle">Lock in a prediction first.</p>}
        <p ref={statusRef} tabIndex={-1} className="m-0 text-sm focus:outline-none" aria-live="polite">
          {!persona
            ? 'Call Juniper to start.'
            : persona.custom
              ? `Now answering as ${persona.name}.${persona.rule ? ` Your rule: “${persona.rule}”` : ''}`
              : 'Now answering as the original Juniper.'}
        </p>
        {(status || turns.length > 0) && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-page p-4">
            {run.timeline && run.state && (
              <>
                <ConversationTimeline
                  runs={[
                    {
                      key: run.state.id,
                      label: ranAs,
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
            {/* Only the booking's status is announced, not each turn as it arrives. */}
            <p role="status" className="sr-only">
              {status === 'running'
                ? 'The test caller is on the line.'
                : status === 'failed'
                  ? 'The booking didn’t finish.'
                  : status === 'done'
                    ? 'The booking is done.'
                    : ''}
            </p>
            <TurnList turns={turns} />
          </div>
        )}
        <p className="m-0 text-small text-subtle">{copy.experimentsNote}</p>
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-5 py-6 sm:px-7">
        <p className="m-0 text-sm leading-relaxed">
          <span className="font-semibold text-fg">Notice. </span>
          {copy.notice}
        </p>
        {showAnswer ? (
          <div className="flex flex-col gap-2 rounded-md border border-accent-line bg-accent-soft p-4 text-sm leading-relaxed text-fg">
            <p ref={answerRef} tabIndex={-1} className="m-0 focus:outline-none">
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
