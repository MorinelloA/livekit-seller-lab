import type { LoggedTurn } from '@/lib/protocol';
import { pauseRows } from '@/lib/runSummary';
import { cx } from '@/components/ui/cx';

export interface PausePartsRun {
  label: string;
  tone: 'baseline' | 'enhanced';
  turns: LoggedTurn[];
}

/**
 * Experiment 4's readout: each part of the pause, one row per part, a bar per
 * model. Grouped, not stacked: the steps overlap (the agent starts drafting
 * before the turn is confirmed), so they don't add up to the total.
 */
export function PauseParts({ runs }: { runs: PausePartsRun[] }) {
  const rows = pauseRows(runs.map((run) => run.turns));
  const largest = Math.max(1, ...rows.flatMap((r) => r.values.filter((v): v is number => v != null)));
  if (rows.every((r) => r.values.every((v) => v == null))) return null;

  return (
    <figure className="m-0 flex flex-col gap-3 rounded-md border border-line bg-page p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow-sm text-subtle">The pause, part by part</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
          {runs.map((run) => (
            <span key={run.label} className="inline-flex items-center gap-1.5">
              <span className={cx('h-2 w-3.5 rounded-full', run.tone === 'enhanced' ? 'bg-accent' : 'bg-subtle')} />
              {run.label}
            </span>
          ))}
        </span>
      </figcaption>
      <dl className="m-0 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 text-small">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className={row.key === 'llm_node_ttft' || row.key === 'e2e_latency' ? 'font-semibold text-fg' : 'text-body'}>
              {row.label}
            </dt>
            <dd className="m-0 flex flex-col gap-1">
              {row.values.map((value, i) => (
                <span key={runs[i].label} className="flex items-center gap-2">
                  <span
                    className={cx('h-2 rounded-full', runs[i].tone === 'enhanced' ? 'bg-accent' : 'bg-subtle')}
                    style={{ width: value == null ? 0 : `${Math.max(1.5, (value / largest) * 80)}%` }}
                  />
                  <span className="font-mono text-label text-subtle tabular-nums">
                    {value == null ? '–' : `${value.toFixed(2)} s`}
                  </span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
