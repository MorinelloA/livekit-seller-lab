'use client';

import { useEffect, useState } from 'react';
import { CLIPS } from './experiments';
import type { ClipKey } from './timeline';

/** A clip's loudness: the largest sample in each 10 ms step, scaled so the loudest is 1. */
export interface Peaks {
  duration: number;
  step: number;
  values: number[];
}

const STEP = 0.01;
const cache = new Map<string, Promise<Peaks>>();

async function decode(url: string): Promise<Peaks> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load ${url}.`);
  // An offline context decodes without a click: no autoplay rule applies.
  const context = new OfflineAudioContext(1, 1, 48_000);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  const samples = buffer.getChannelData(0);
  const per = Math.max(1, Math.round(buffer.sampleRate * STEP));
  const values: number[] = [];
  let loudest = 0;
  for (let i = 0; i < samples.length; i += per) {
    let peak = 0;
    for (let j = i; j < Math.min(i + per, samples.length); j++) peak = Math.max(peak, Math.abs(samples[j]));
    values.push(peak);
    loudest = Math.max(loudest, peak);
  }
  const scale = loudest > 0 ? 1 / loudest : 0;
  return { duration: buffer.duration, step: STEP, values: values.map((v) => Math.round(v * scale * 1000) / 1000) };
}

/** Decodes a clip once per page; later calls share the result. */
export function loadPeaks(clip: ClipKey): Promise<Peaks> {
  const url = CLIPS[clip];
  let pending = cache.get(url);
  if (!pending) {
    pending = decode(url);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

/** The peaks of every clip in `clips`, filling in as they decode. `given` skips decoding (the replay ships its own). */
export function usePeaks(clips: ClipKey[], given?: Partial<Record<ClipKey, Peaks>>): Partial<Record<ClipKey, Peaks>> {
  const [peaks, setPeaks] = useState<Partial<Record<ClipKey, Peaks>>>(given ?? {});
  const wanted = [...new Set(clips)].filter((clip) => !given?.[clip]).sort().join(',');

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    for (const clip of wanted.split(',') as ClipKey[]) {
      loadPeaks(clip)
        .then((p) => alive && setPeaks((prev) => (prev[clip] ? prev : { ...prev, [clip]: p })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [wanted]);

  return given ? { ...peaks, ...given } : peaks;
}
