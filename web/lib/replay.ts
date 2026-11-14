// A recorded test-caller run, as the overview replays it. Captured in
// development with ?capture on the lab page and scripts/capture-server.mjs.

import type { Peaks } from './peaks';
import type { LoggedEvent } from './protocol';
import type { ClipKey, RunTimeline } from './timeline';

export interface ReplayRun {
  v: 1;
  /** ISO date of the capture. */
  capturedAt: string;
  timeline: RunTimeline;
  events: LoggedEvent[];
  peaks: Partial<Record<ClipKey, Peaks>>;
  /** The recording of the run (caller and Juniper), and the run's clock in ms at its first sample. */
  audio: { src: string; offsetMs: number } | null;
}

/** Where sound first rises above `threshold`, in ms, or null in silence. */
export function firstSoundMs(samples: Float32Array, sampleRate: number, threshold = 0.02): number | null {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) return (i / sampleRate) * 1000;
  }
  return null;
}

/** 16-bit mono WAV, averaged down to `outRate` (24 kHz keeps a voice clear at half the size). */
export function encodeWav(samples: Float32Array, inRate: number, outRate = 24_000): Blob {
  const ratio = Math.max(1, Math.round(inRate / outRate));
  const rate = inRate / ratio;
  const length = Math.floor(samples.length / ratio);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < ratio; j++) sum += samples[i * ratio + j];
    const s = Math.max(-1, Math.min(1, sum / ratio));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
