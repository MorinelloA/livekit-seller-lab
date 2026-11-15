import { Eyebrow } from '@/components/ui/Bits';
import { isTurn, type LabSettings, type LoggedEvent, type Mode } from '@/lib/protocol';
import { Scroller } from '@/components/ui/Scroller';

const seconds = (value: number | null | undefined) => (value == null ? '–' : `${value.toFixed(2)} s`);
const short: Record<Mode, string> = { baseline: 'Base', enhanced: 'Enh' };

/** Turn detection / interruptions / voice isolation / model, in a few characters. */
function settingsText(settings: LabSettings): string {
  const parts = [short[settings.turn_detection], short[settings.interruptions]];
  if (settings.noise) parts.push(settings.noise === 'enhanced' ? 'Iso' : 'Raw');
  if (settings.model) parts.push(settings.model === 'reasoning' ? 'Reason' : 'Fast');
  return parts.join(' / ');
}

const th = 'px-3 py-2.5 font-mono text-[11px] font-bold tracking-[0.12em] uppercase text-subtle whitespace-nowrap';
const num = 'px-3 py-2.5 font-mono text-[13px] tabular-nums whitespace-nowrap';

/** Every turn in the call, newest first, with LiveKit's own timing for it. */
export function TurnLog({ events }: { events: LoggedEvent[] }) {
  const turns = events.filter(isTurn).reverse();
  const longest = Math.max(1, ...turns.map((t) => t.metrics.e2e_latency ?? 0));

  return (
    <section id="every-turn" aria-labelledby="every-turn-title" className="flex scroll-mt-6 flex-col gap-4 pt-6">
      <div className="flex flex-col gap-2">
        <Eyebrow size="sm">LiveKit’s per-turn metrics</Eyebrow>
        <h2 id="every-turn-title" className="display text-[30px] leading-[1.15]">
          Every turn, measured
        </h2>
        <p className="max-w-[720px] text-sm leading-relaxed">
          The timing comes from LiveKit’s per-turn metrics, measured on the agent. What you hear also includes network
          time. The total pause runs from when the caller stopped talking to when Juniper started answering.
        </p>
      </div>
      {turns.length === 0 ? (
        <p className="m-0 text-sm text-subtle">Turns appear here once the call starts.</p>
      ) : (
        <Scroller label="LiveKit’s per-turn metrics" className="rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-line bg-surface">
              <tr>
                <th scope="col" className={th}>Who</th>
                <th scope="col" className={th}>What was said</th>
                <th scope="col" className={th} title="Turn detection / interruptions / voice isolation (Iso) or raw audio / fast or reasoning model">
                  Settings
                </th>
                <th scope="col" className={th}>End of turn</th>
                <th scope="col" className={th}>Transcript</th>
                <th scope="col" className={th}>LLM first token</th>
                <th scope="col" className={th}>Voice starts</th>
                <th scope="col" className={th}>Total pause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {turns.map((turn) => (
                <tr key={turn.id}>
                  <td className="px-3 py-2.5 font-semibold whitespace-nowrap text-fg">
                    {turn.role === 'user' ? 'Caller' : (turn.agent ?? 'Juniper')}
                  </td>
                  <td className="max-w-xs px-3 py-2.5">
                    {turn.text || '(nothing heard)'}
                    {turn.interrupted && (
                      <span className="ml-1.5 rounded-sm bg-warn-soft px-1.5 font-mono text-[11px] text-warn">cut off</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-subtle">{settingsText(turn.settings)}</td>
                  <td className={num}>{seconds(turn.metrics.end_of_turn_delay)}</td>
                  <td className={num}>{seconds(turn.metrics.transcription_delay)}</td>
                  <td className={num}>{seconds(turn.metrics.llm_node_ttft)}</td>
                  <td className={num}>{seconds(turn.metrics.tts_node_ttfb)}</td>
                  <td className={`${num} font-bold text-fg`}>
                    <span className="flex items-center gap-2">
                      {seconds(turn.metrics.e2e_latency)}
                      {turn.metrics.e2e_latency != null && (
                        <span
                          aria-hidden
                          className="inline-block h-1.5 rounded-full bg-accent"
                          style={{ width: `${Math.max(4, (turn.metrics.e2e_latency / longest) * 56)}px` }}
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}
    </section>
  );
}
