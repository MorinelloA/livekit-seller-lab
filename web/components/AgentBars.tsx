'use client';

import { BarVisualizer, useVoiceAssistant } from '@livekit/components-react';
import { cx } from '@/components/ui/cx';

/**
 * The agent's voice as five bars: LiveKit's own BarVisualizer, which also
 * animates while the agent is thinking. Needs a Room in context, so mount it
 * only during a call. Under reduced motion it becomes a still dot.
 */
export function AgentBars({ tone = 'accent' }: { tone?: 'accent' | 'ok' }) {
  const { state, audioTrack } = useVoiceAssistant();
  return (
    <>
      <BarVisualizer
        state={state}
        track={audioTrack}
        barCount={5}
        options={{ minHeight: 18, maxHeight: 100 }}
        className="flex h-7 w-10 shrink-0 items-center justify-between motion-reduce:hidden"
        aria-hidden
      >
        <span
          className={cx(
            'w-[5px] rounded-full bg-line transition-colors',
            tone === 'ok' ? 'data-[lk-highlighted=true]:bg-ok' : 'data-[lk-highlighted=true]:bg-accent',
          )}
        />
      </BarVisualizer>
      <span
        aria-hidden
        className={cx(
          'hidden size-2.5 shrink-0 rounded-full motion-reduce:inline-block',
          state === 'speaking' ? (tone === 'ok' ? 'bg-ok' : 'bg-accent') : 'bg-subtle',
        )}
      />
    </>
  );
}
