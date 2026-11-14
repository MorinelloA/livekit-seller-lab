'use client';

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
    <fieldset className="space-y-3 rounded-xl bg-stone-50 p-4" disabled={locked}>
      <legend className="sr-only">Predict</legend>
      <p className="text-sm">
        <span className="font-semibold">Predict. </span>
        {question}
      </p>
      <div className="space-y-1.5">
        {options.map((option, index) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${props.name}-prediction`}
              checked={choice === index}
              onChange={() => props.onChoose(index)}
              className="accent-accent"
            />
            {option}
          </label>
        ))}
      </div>
      {!locked ? (
        <button
          type="button"
          onClick={props.onLock}
          disabled={choice === null}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Lock in my prediction
        </button>
      ) : (
        <p className="text-sm text-stone-600">Locked in.</p>
      )}
    </fieldset>
  );
}
