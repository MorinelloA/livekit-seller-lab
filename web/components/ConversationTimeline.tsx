'use client';

import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { type Peaks, usePeaks } from '@/lib/peaks';
import type { LoggedEvent } from '@/lib/protocol';
import {
  axisFor,
  buildLanes,
  CLIP_PHRASES,
  type ClipKey,
  type ClipPlay,
  type Lanes,
  type RunTimeline,
  type Span,
  speechRuns,
} from '@/lib/timeline';

export interface TimelineRun {
  key: string;
  label: string;
  /** The LiveKit setting's lane is labelled in the accent, the baseline's in grey. */
  tone: 'baseline' | 'enhanced';
  timeline: RunTimeline;
  events: LoggedEvent[];
}

// Layout, in px. Lanes keep their height at every width; time stretches to fit.
const PITCH = 5;
const MAX_DOTS = 4;
const CALLER_TOP = 18;
const CALLER_MID = CALLER_TOP + 24;
const CAPTION_TOP = 72;
const RUNS_TOP = 114;
const RUN_BLOCK = 80;
const LANE_OFFSET = 18;
const LANE_HEIGHT = 24;
const PAUSE_MS = 1_500;
// Commit Mono at 11 px: about 6.6 px a character.
const CHAR_PX = 6.6;

/**
 * Captions that fit: kept inside the frame, moved to a second row where they'd
 * run into the one before, and dropped only when both rows are taken.
 */
function placeCaptions(captions: { at: number; text: string }[], x: (ms: number) => number, width: number) {
  const placed: { left: number; row: number; text: string }[] = [];
  const rowRight = [-Infinity, -Infinity];
  for (const caption of [...captions].sort((a, b) => a.at - b.at)) {
    const w = caption.text.length * CHAR_PX;
    const left = Math.min(Math.max(0, x(caption.at) - w / 2), width - w);
    const row = rowRight.findIndex((right) => left >= right + 12);
    if (row === -1) continue;
    placed.push({ left, row, text: caption.text });
    rowRight[row] = left + w;
  }
  return placed;
}

function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(1040);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** performance.now(), every frame while a run is live; four times a second under reduced motion. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = setInterval(() => setNow(performance.now()), 250);
      return () => clearInterval(id);
    }
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return now;
}

/** How loud the caller was between t0 and t1 (ms), 0 to 1: the mean of the clip's 10 ms peaks. -1 when no clip is playing. */
function loudness(clips: ClipPlay[], peaks: Partial<Record<ClipKey, Peaks>>, t0: number, t1: number): number {
  let playing = false;
  let sum = 0;
  let count = 0;
  for (const clip of clips) {
    if (t1 <= clip.start || t0 >= clip.end) continue;
    playing = true;
    const p = peaks[clip.clip];
    if (!p) continue;
    const from = Math.max(0, Math.floor((t0 - clip.start) / 1000 / p.step));
    const to = Math.min(p.values.length, Math.ceil((t1 - clip.start) / 1000 / p.step));
    for (let i = from; i < to; i++) {
      sum += p.values[i];
      count += 1;
    }
  }
  if (!playing) return -1;
  return count ? sum / count : 0;
}

/** The caller's audio as a dot matrix: one column every PITCH px, taller where it's louder. */
function callerDots(
  clips: ClipPlay[],
  peaks: Partial<Record<ClipKey, Peaks>>,
  width: number,
  toMs: (px: number) => number,
): string {
  const parts: string[] = [];
  for (let px = PITCH / 2; px < width; px += PITCH) {
    const level = loudness(clips, peaks, toMs(px - PITCH / 2), toMs(px + PITCH / 2));
    if (level < 0) continue;
    const k = Math.round(Math.min(1, level * 1.6) * MAX_DOTS);
    parts.push(k ? `M${px.toFixed(1)} ${CALLER_MID - k * PITCH}V${CALLER_MID + k * PITCH}` : `M${px.toFixed(1)} ${CALLER_MID}v.01`);
  }
  return parts.join('');
}

/** Where the caller spoke (absolute ms), with the words for each stretch when the counts match. */
function callerSpeech(clips: ClipPlay[], peaks: Partial<Record<ClipKey, Peaks>>) {
  const captions: { at: number; text: string }[] = [];
  const pauses: Span[] = [];
  const speech: Span[] = [];
  for (const clip of clips) {
    const p = peaks[clip.clip];
    if (!p) continue;
    const runs = speechRuns(p.values, p.step).map((r) => ({ start: clip.start + r.start * 1000, end: clip.start + r.end * 1000 }));
    speech.push(...runs);
    // A pause worth naming is one long enough to fool a silence timer.
    const gaps = runs.slice(1).map((r, i) => ({ start: runs[i].end, end: r.start }));
    const long = gaps.filter((g) => g.end - g.start >= PAUSE_MS);
    pauses.push(...long);
    const phrases = CLIP_PHRASES[clip.clip] ?? [];
    if (phrases.length === runs.length && long.length === gaps.length) {
      runs.forEach((r, i) => captions.push({ at: (r.start + r.end) / 2, text: phrases[i] }));
    } else if (phrases.length > 0 && runs.length > 0) {
      captions.push({ at: (runs[0].start + runs[runs.length - 1].end) / 2, text: phrases.join(' ') });
    }
  }
  return { captions, pauses, speech };
}

function describe(label: string, lanes: Lanes): string {
  const replies = lanes.speaking.length;
  const cut = lanes.speaking.filter((s) => s.interrupted).length;
  const parts = [`${label}: Juniper spoke ${replies} ${replies === 1 ? 'time' : 'times'}`];
  if (cut) parts.push(`was cut off ${cut} ${cut === 1 ? 'time' : 'times'}`);
  if (lanes.stalls.length) parts.push(`stopped and picked up again ${lanes.stalls.length} ${lanes.stalls.length === 1 ? 'time' : 'times'}`);
  return parts.join(', ');
}

export function ConversationTimeline({
  runs,
  minSeconds,
  peaks: givenPeaks,
  showOverlap = false,
  playheadMs = null,
  title,
}: {
  runs: TimelineRun[];
  minSeconds: number;
  /** Peaks shipped with a recorded replay; otherwise each clip is decoded on the page. */
  peaks?: Partial<Record<ClipKey, Peaks>>;
  /** Shade where Juniper talked over the caller (Experiment 1's problem). */
  showOverlap?: boolean;
  /** For the replay: where playback is, in ms from the alignment point. */
  playheadMs?: number | null;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const live = runs.some((r) => r.timeline.status === 'running' && r.timeline.t0Perf !== undefined);
  const now = useNow(live);

  const lanes = runs.map((r) => {
    const t0 = r.timeline.t0Perf;
    return buildLanes(r.timeline, r.events, live && t0 !== undefined && r.timeline.status === 'running' ? now - t0 : undefined);
  });
  const axis = axisFor(lanes, minSeconds);
  const pxPerMs = width / axis.span;
  const x = (ms: number) => (ms - axis.origin) * pxPerMs;
  const pct = (ms: number) => `${((ms - axis.origin) / axis.span) * 100}%`;

  // Both runs hear the same clips; the caller's lane comes from the first run that has them.
  const callerClips = lanes.find((l) => l.clips.length > 0)?.clips ?? [];
  const clipKeys = callerClips.map((c) => c.clip);
  const peaks = usePeaks(clipKeys, givenPeaks);
  const dots = useMemo(
    () => callerDots(callerClips, peaks, width, (px) => axis.origin + px / pxPerMs),
    // The clips only change when a new one starts; recomputing per frame would be wasted.
    [JSON.stringify(callerClips), peaks, width, axis.origin, axis.span],
  );
  const { captions, pauses, speech } = useMemo(() => callerSpeech(callerClips, peaks), [JSON.stringify(callerClips), peaks]);

  const compact = width < 560;
  // Captions are hidden on narrow screens, so their rows go too.
  const runsTop = compact ? 92 : RUNS_TOP;
  const axisTop = runsTop + runs.length * RUN_BLOCK + 4;
  const height = axisTop + 24;
  const step = axis.span > 16_000 || compact ? 2_000 : 1_000;
  const ticks = Array.from({ length: Math.floor(axis.span / step) + 1 }, (_, i) => axis.origin + i * step);

  const cursors = runs.flatMap((r, i) => {
    const t0 = r.timeline.t0Perf;
    if (!live || r.timeline.status !== 'running' || t0 === undefined) return [];
    const shift = r.timeline.alignAt ?? r.timeline.clips[0]?.start ?? 0;
    return [{ key: r.key, ms: now - t0 - shift, i }];
  });

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        role="img"
        aria-label={`${title}. ${runs.map((r, i) => describe(r.label, lanes[i])).join('. ')}.`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {showOverlap &&
          runs.map((r, i) =>
            lanes[i].speaking.flatMap((s, j) =>
              speech
                .map((c) => ({ start: Math.max(c.start, s.start), end: Math.min(c.end, s.end) }))
                .filter((o) => o.end > o.start)
                .map((o, k) => {
                  const left = x(o.start);
                  const width = Math.max(2, x(o.end) - left);
                  const laneTop = runsTop + i * RUN_BLOCK + LANE_OFFSET;
                  return (
                    <g key={`${r.key}-${j}-${k}`} className="fill-warn-soft">
                      <rect x={left} y={CALLER_TOP} width={width} height={48} />
                      <rect x={left} y={laneTop} width={width} height={LANE_HEIGHT} />
                    </g>
                  );
                }),
            ),
          )}

        <path
          d={dots}
          className="stroke-caller"
          fill="none"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray={`0 ${PITCH}`}
        />

        {runs.map((r, i) => {
          const mid = runsTop + i * RUN_BLOCK + LANE_OFFSET + LANE_HEIGHT / 2;
          const l = lanes[i];
          return (
            <g key={r.key}>
              <line x1={0} x2={width} y1={mid} y2={mid} className="stroke-line" strokeWidth={1} />
              {l.thinking.map((s, j) => (
                <rect
                  key={`t${j}`}
                  x={x(s.start) + 0.5}
                  y={mid - 6.5}
                  width={Math.max(3, x(s.end) - x(s.start) - 1)}
                  height={13}
                  rx={6.5}
                  className="stroke-accent"
                  fill="none"
                  strokeWidth={1.25}
                  strokeDasharray="2 3"
                />
              ))}
              {l.speaking.map((s, j) => (
                <rect
                  key={`s${j}`}
                  x={x(s.start)}
                  y={mid - 7}
                  width={Math.max(4, x(s.end) - x(s.start))}
                  height={14}
                  rx={7}
                  className="fill-accent"
                />
              ))}
              {l.stalls.map((s, j) => (
                <rect
                  key={`p${j}`}
                  x={x(s.start)}
                  y={mid + 10}
                  width={Math.max(3, x(s.end) - x(s.start))}
                  height={2.5}
                  rx={1.25}
                  className="fill-warn"
                />
              ))}
              {l.speaking
                .filter((s) => s.interrupted)
                .map((s, j) => (
                  <line
                    key={`c${j}`}
                    x1={x(s.end)}
                    x2={x(s.end)}
                    y1={mid - 13}
                    y2={mid + 13}
                    className="stroke-warn"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                ))}
            </g>
          );
        })}

        <line x1={0} x2={width} y1={axisTop} y2={axisTop} className="stroke-line" strokeWidth={1} />
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={axisTop} y2={axisTop + 5} className="stroke-line" strokeWidth={1} />
        ))}

        {playheadMs !== null && (
          <g>
            <line x1={x(playheadMs)} x2={x(playheadMs)} y1={CALLER_TOP - 6} y2={axisTop} className="stroke-accent" strokeWidth={1.5} />
            <circle cx={x(playheadMs)} cy={CALLER_TOP - 6} r={4} className="fill-accent" />
          </g>
        )}
        {cursors.map((c) => (
          <line
            key={c.key}
            x1={x(c.ms)}
            x2={x(c.ms)}
            y1={CALLER_TOP - 6}
            y2={runsTop + (c.i + 1) * RUN_BLOCK}
            className="stroke-accent"
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />
        ))}
      </svg>

      <p className="eyebrow absolute top-0 left-0 text-[11px] text-subtle" aria-hidden>
        Test caller
      </p>
      {!compact &&
        placeCaptions(captions, x, width).map((c, i) => (
          <p
            key={i}
            aria-hidden
            className="absolute font-mono text-[11px] leading-4 whitespace-nowrap text-body"
            style={{ left: `${(c.left / width) * 100}%`, top: CAPTION_TOP + c.row * 18 }}
          >
            {c.text}
          </p>
        ))}
      {pauses.map((p, i) => (
        // The pause's length, written into the silence it measures.
        <p
          key={i}
          aria-hidden
          className="absolute -translate-x-1/2 bg-page px-1.5 font-mono text-[11px] leading-4 whitespace-nowrap text-subtle tabular-nums"
          style={{ left: pct((p.start + p.end) / 2), top: CALLER_MID - 8 }}
        >
          {((p.end - p.start) / 1000).toFixed(1)} s{compact ? '' : ' pause'}
        </p>
      ))}
      {runs.map((r, i) => {
        const top = runsTop + i * RUN_BLOCK;
        return (
          <div key={r.key} aria-hidden>
            <p
              className={`eyebrow absolute left-0 text-[11px] ${r.tone === 'enhanced' ? 'text-accent' : 'text-subtle'}`}
              style={{ top }}
            >
              {r.label}
              {r.timeline.status === 'running' && <span className="ml-2 font-normal tracking-normal normal-case">· live</span>}
            </p>
            {lanes[i].speaking
              .filter((s) => s.interrupted)
              .map((s, j) => (
                <p
                  key={j}
                  className="absolute -translate-x-1/2 font-mono text-[11px] leading-[14px] whitespace-nowrap text-warn"
                  style={{ left: pct(s.end), top: top + LANE_OFFSET + LANE_HEIGHT + 4 }}
                >
                  cut off
                </p>
              ))}
            {lanes[i].stalls.slice(0, 1).map((s, j) => (
              <p
                key={j}
                className="absolute -translate-x-1/2 font-mono text-[11px] leading-[14px] whitespace-nowrap text-warn"
                style={{ left: pct((s.start + s.end) / 2), top: top + LANE_OFFSET + LANE_HEIGHT + 4 }}
              >
                stalled
              </p>
            ))}
          </div>
        );
      })}
      {ticks.map((t, i) => (
        <p
          key={t}
          aria-hidden
          className={`absolute font-mono text-[11px] leading-4 text-subtle tabular-nums ${
            i === 0 ? '' : i === ticks.length - 1 && x(t) > width - 30 ? '-translate-x-full' : '-translate-x-1/2'
          }`}
          style={{ left: pct(t), top: axisTop + 7 }}
        >
          {i === 0 ? '0 s' : `${Math.round((t - axis.origin) / 1000)}`}
        </p>
      ))}
    </div>
  );
}

/** The key for the timeline: what each mark means. */
export function TimelineLegend({ overlap = false, stalls = false }: { overlap?: boolean; stalls?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-subtle">
      <li className="flex items-center gap-2">
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
          <path d="M3 6v.01M8 3V9M13 1V11M18 6v.01" className="stroke-caller" fill="none" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0 3" />
        </svg>
        Caller
      </li>
      <li className="flex items-center gap-2">
        <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
          <rect x="1" y="1" width="20" height="8" rx="4" className="fill-accent" />
        </svg>
        Juniper speaking
      </li>
      <li className="flex items-center gap-2">
        <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
          <rect x="1.5" y="1.5" width="19" height="7" rx="3.5" className="stroke-accent" fill="none" strokeWidth={1.25} strokeDasharray="2 2" />
        </svg>
        Thinking
      </li>
      <li className="flex items-center gap-2">
        <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden>
          <line x1="4" y1="1.5" x2="4" y2="12.5" className="stroke-warn" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
        Cut off
      </li>
      {stalls && (
        <li className="flex items-center gap-2">
          <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden>
            <rect x="1" y="2" width="16" height="2.5" rx="1.25" className="fill-warn" />
          </svg>
          Stopped, then picked up again
        </li>
      )}
      {overlap && (
        <li className="flex items-center gap-2">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
            <rect width="16" height="12" className="fill-warn-soft" />
          </svg>
          Both talking
        </li>
      )}
    </ul>
  );
}
