import { cx } from '@/components/ui/cx';
import type { LoggedTurn } from '@/lib/protocol';
import { extraWords } from '@/lib/runSummary';

/** A caller's line with the words that aren't in the café booking marked: the café said them. */
function MarkedLine({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        extraWords(part).length > 0 ? (
          <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-warn">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The conversation from one run, with Juniper's cut-off replies marked. */
export function TurnList({ turns, markExtra = false }: { turns: LoggedTurn[]; markExtra?: boolean }) {
  if (turns.length === 0) return null;
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0 text-small leading-normal">
      {turns.map((turn) => (
        <li key={turn.id}>
          <span className={cx('font-semibold', turn.role === 'user' ? 'text-fg' : 'text-accent')}>
            {turn.role === 'user' ? 'Caller' : (turn.agent ?? 'Juniper')}:{' '}
          </span>
          <span>
            {!turn.text ? '(nothing heard)' : markExtra && turn.role === 'user' ? <MarkedLine text={turn.text} /> : turn.text}
          </span>
          {turn.interrupted && (
            <span className="ml-1.5 rounded-sm bg-warn-soft px-1.5 font-mono text-label text-warn">cut off</span>
          )}
        </li>
      ))}
    </ol>
  );
}
