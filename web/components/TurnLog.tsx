import { isTurn, type LabSettings, type LoggedEvent, type Mode } from '@/lib/protocol';

const seconds = (value: number | null | undefined) => (value == null ? '–' : `${value.toFixed(2)} s`);
const short: Record<Mode, string> = { baseline: 'Base', enhanced: 'Enh' };

/** Turn detection / interruptions / voice isolation / model, in a few characters. */
function settingsText(settings: LabSettings): string {
  const parts = [short[settings.turn_detection], short[settings.interruptions]];
  if (settings.noise) parts.push(settings.noise === 'enhanced' ? 'Iso' : 'Raw');
  if (settings.model) parts.push(settings.model === 'reasoning' ? 'Reason' : 'Fast');
  return parts.join(' / ');
}

/** Every turn in the call, newest first, with LiveKit's own timing for it. */
export function TurnLog({ events }: { events: LoggedEvent[] }) {
  const turns = events.filter(isTurn).reverse();

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Every turn, measured</h2>
        <p className="text-sm text-stone-600">
          The timing comes from LiveKit’s per-turn metrics, measured on the agent. What you hear also
          includes network time. The total pause runs from when the caller stopped talking to when
          Juniper started answering.
        </p>
      </div>
      {turns.length === 0 ? (
        <p className="text-sm text-stone-500">Turns appear here once the call starts.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Who</th>
                <th scope="col" className="px-3 py-2 font-medium">What was said</th>
                <th
                  scope="col"
                  className="px-3 py-2 font-medium"
                  title="Turn detection / interruptions / voice isolation (Iso) or raw audio / fast or reasoning model"
                >
                  Settings
                </th>
                <th scope="col" className="px-3 py-2 font-medium">End of turn</th>
                <th scope="col" className="px-3 py-2 font-medium">Transcript</th>
                <th scope="col" className="px-3 py-2 font-medium">LLM first token</th>
                <th scope="col" className="px-3 py-2 font-medium">Voice starts</th>
                <th scope="col" className="px-3 py-2 font-medium">Total pause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {turns.map((turn) => (
                <tr key={turn.id}>
                  <td className="px-3 py-2 font-medium">{turn.role === 'user' ? 'Caller' : (turn.agent ?? 'Juniper')}</td>
                  <td className="max-w-xs px-3 py-2 text-stone-700">
                    {turn.text || '(nothing heard)'}
                    {turn.interrupted && <span className="ml-1 text-xs text-amber-700">(cut off)</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-stone-500">{settingsText(turn.settings)}</td>
                  <td className="px-3 py-2 tabular-nums">{seconds(turn.metrics.end_of_turn_delay)}</td>
                  <td className="px-3 py-2 tabular-nums">{seconds(turn.metrics.transcription_delay)}</td>
                  <td className="px-3 py-2 tabular-nums">{seconds(turn.metrics.llm_node_ttft)}</td>
                  <td className="px-3 py-2 tabular-nums">{seconds(turn.metrics.tts_node_ttfb)}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{seconds(turn.metrics.e2e_latency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
