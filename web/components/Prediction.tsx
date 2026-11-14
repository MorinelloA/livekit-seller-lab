'use client';

import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';

/** "Predict" step shared by every section: pick an answer, then lock it in. */
export function Prediction(props: {
  /** Unique per section; names the radio group. A fixed name, not useId, so the
   *  server-rendered HTML always matches the page. */
  name: string;
  question: string;
  options: string[];
  choice: number | null;
  locked: boolean;
  onChoose: (index: number) => void;
  onLock: () => void;
}) {
  const { question, options, choice, locked } = props;

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={locked}>
      <legend className="sr-only">Predict</legend>
      <p className="m-0 text-[15px] leading-relaxed text-fg">{question}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option, index) => {
          const chosen = choice === index;
          return (
            <label
              key={option}
              className={cx(
                'flex min-h-12 items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm leading-snug transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                chosen ? 'border-accent-line bg-accent-soft text-fg' : 'border-line text-body',
                locked ? (chosen ? '' : 'opacity-60') : 'cursor-pointer hover:border-subtle',
              )}
            >
              <input
                type="radio"
                name={`${props.name}-prediction`}
                checked={chosen}
                onChange={() => props.onChoose(index)}
                className="size-4 shrink-0 accent-accent"
              />
              {option}
            </label>
          );
        })}
      </div>
      {!locked && (
        <div>
          <Button variant="primary" onClick={props.onLock} disabled={choice === null}>
            Lock in my prediction
          </Button>
        </div>
      )}
    </fieldset>
  );
}
