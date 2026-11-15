'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationTimeline, type TimelineRun, TimelineLegend } from '@/components/ConversationTimeline';
import { brandCase, Eyebrow, Segmented } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { withBase } from '@/lib/paths';
import type { Peaks } from '@/lib/peaks';
import type { Mode } from '@/lib/protocol';
import type { ReplayRun } from '@/lib/replay';
import type { ClipKey } from '@/lib/timeline';

export interface ReplayEntry {
  mode: Mode;
  label: string;
  summary: string;
  replay: ReplayRun;
}

const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

/**
 * The overview's hero: two real test-caller runs on one time axis, with the
 * recording of either one. The playhead follows the audio.
 */
export function Replay({ entries }: { entries: ReplayEntry[] }) {
  const [mode, setMode] = useState<Mode>('baseline');
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);

  const entry = entries.find((e) => e.mode === mode) ?? entries[0];
  const shiftOf = (e: ReplayEntry) => e.replay.timeline.alignAt ?? e.replay.timeline.clips[0]?.start ?? 0;
  const duration = Math.max(...entries.map((e) => (e.replay.timeline.endAt ?? 0) - shiftOf(e)));

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const play = useCallback(async () => {
    const audio = entry.replay.audio;
    if (!audio) return;
    stop();
    const element = new Audio(withBase(audio.src));
    audioRef.current = element;
    const shift = shiftOf(entry);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = 0;
    const tick = (now: number) => {
      // Under reduced motion the playhead steps four times a second.
      if (!reduce || now - last > 250) {
        last = now;
        setPlayhead(audio.offsetMs + element.currentTime * 1000 - shift);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    element.onended = () => {
      stop();
      setPlayhead(null);
    };
    try {
      await element.play();
      setPlaying(true);
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setPlaying(false);
    }
  }, [entry, stop]);

  const runs: TimelineRun[] = entries.map((e) => ({
    key: e.mode,
    label: playing && e.mode === mode ? `${e.label} · playing` : e.label,
    tone: e.mode,
    timeline: e.replay.timeline,
    events: e.replay.events,
  }));
  const peaks = Object.assign({}, ...entries.map((e) => e.replay.peaks)) as Partial<Record<ClipKey, Peaks>>;
  const recorded = new Date(entries[0].replay.capturedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <Eyebrow size="sm">Experiment 1 · Turn detection</Eyebrow>
          <h2 id="replay-title" className="m-0 text-title leading-snug font-normal tracking-title text-fg">
            Same caller, two settings
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Which run to hear"
            options={entries.map((e) => ({ value: e.mode, label: e.mode === 'baseline' ? 'Baseline' : 'Enhanced' }))}
            value={mode}
            onChange={(next) => {
              stop();
              setPlayhead(null);
              setMode(next);
            }}
          />
          <Button onClick={() => (playing ? stop() : void play())} disabled={!entry.replay.audio}>
            <Icon name={playing ? 'pause' : 'play'} className="size-3" />
            {playing ? 'Pause' : `Play the ${mode === 'baseline' ? 'Baseline' : 'Enhanced'} call`}
          </Button>
          <span className="font-mono text-small text-subtle tabular-nums" aria-hidden>
            {clock(playhead ?? 0)} / {clock(duration)}
          </span>
        </div>
      </div>

      <div className="px-4 pt-6 pb-2 sm:px-6">
        <ConversationTimeline
          runs={runs}
          minSeconds={13}
          peaks={peaks}
          showOverlap
          playheadMs={playhead}
          title="Experiment 1, recorded: the same test caller on both settings"
        />
      </div>
      <div className="px-4 pt-2 pb-5 sm:px-6">
        <TimelineLegend overlap />
      </div>

      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        {entries.map((e) => (
          <div key={e.mode} className="flex flex-col gap-1.5 bg-surface px-5 py-5 sm:px-6">
            <p className={cx('eyebrow-sm m-0', e.mode === 'enhanced' ? 'text-accent' : 'text-subtle')}>{brandCase(e.label)}</p>
            <p className="m-0 text-card leading-relaxed text-body">{e.summary}</p>
          </div>
        ))}
      </div>
      <p className="m-0 border-t border-line px-5 py-3.5 font-mono text-xs leading-relaxed text-subtle sm:px-6">
        Recorded on {recorded}: a real call in a LiveKit Cloud room, with the lab’s agent and models. You hear what the
        caller heard, the test clip and Juniper’s voice.
      </p>
    </div>
  );
}
