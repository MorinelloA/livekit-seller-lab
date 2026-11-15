'use client';

import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';

// Plays the recorded runs (public/replay) on the overview and in the lab.
// There is one player for the whole site, kept outside React: starting a
// recording stops whichever one was playing, so two never sound at once.

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

/** blocked: the browser wouldn't start sound for this click. failed: the file didn't load or couldn't be decoded. */
export type PlayerProblem = 'blocked' | 'failed';

export interface PlayerState {
  /** Which recording the player holds, or null when it holds none. */
  key: string | null;
  status: PlayerStatus;
  problem: PlayerProblem | null;
}

const NOTHING: PlayerState = { key: null, status: 'idle', problem: null };

let state: PlayerState = NOTHING;
let positionMs = 0;
let element: HTMLAudioElement | null = null;
/** The hook that started the current recording. When its component goes away, so does the sound. */
let owner: string | null = null;
let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const stateListeners = new Set<() => void>();
const positionListeners = new Set<() => void>();

function set(next: Partial<PlayerState>): void {
  state = { ...state, ...next };
  stateListeners.forEach((listener) => listener());
  positionListeners.forEach((listener) => listener());
}

function stopClock(): void {
  cancelAnimationFrame(frame);
  if (timer !== null) clearInterval(timer);
  timer = null;
}

/** Follows the audio's position: every frame, or four times a second under reduced motion. */
function startClock(audio: HTMLAudioElement): void {
  stopClock();
  const read = () => {
    positionMs = audio.currentTime * 1000;
    positionListeners.forEach((listener) => listener());
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timer = setInterval(read, 250);
    return;
  }
  const tick = () => {
    read();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** Lets go of the current audio element and stops its download. */
function release(): void {
  stopClock();
  const audio = element;
  element = null;
  owner = null;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

/**
 * Asks the element to play. Call it inside the click's own handler: Safari
 * forgets the click after an await, and then refuses to start sound.
 */
function start(audio: HTMLAudioElement): void {
  audio.play().catch((err: unknown) => {
    if (element !== audio) return;
    const name = err instanceof Error ? err.name : '';
    // A pause, or another recording, arrived before this one started. Nothing went wrong.
    if (name === 'AbortError') return;
    stopClock();
    if (name === 'NotAllowedError') set({ status: 'idle', problem: 'blocked' });
    else set({ status: 'error', problem: 'failed' });
  });
}

function play(key: string, src: string, startedBy: string): void {
  release();
  const audio = new Audio(src);
  element = audio;
  owner = startedBy;
  positionMs = 0;
  set({ key, status: 'loading', problem: null });

  // Each handler checks the element is still the current one: a stopped recording's late events are ignored.
  audio.addEventListener('playing', () => {
    if (element !== audio) return;
    set({ status: 'playing', problem: null });
    startClock(audio);
  });
  audio.addEventListener('waiting', () => {
    // Before the first sound this is still "loading"; afterwards the network has fallen behind.
    if (element === audio && state.status === 'playing') set({ status: 'buffering' });
  });
  audio.addEventListener('ended', () => {
    if (element !== audio) return;
    stopClock();
    positionMs = 0;
    set({ status: 'ended' });
  });
  audio.addEventListener('error', () => {
    if (element !== audio) return;
    stopClock();
    set({ status: 'error', problem: 'failed' });
  });
  start(audio);
}

function pause(): void {
  if (!element || !['loading', 'playing', 'buffering'].includes(state.status)) return;
  element.pause();
  stopClock();
  positionMs = element.currentTime * 1000;
  set({ status: 'paused' });
}

/** Picks a paused recording back up where it stopped. Like play, it belongs inside the click's handler. */
function resume(): void {
  if (element && state.status === 'paused') start(element);
}

/**
 * Stops whatever is playing and lets it go; with a `key`, only if the player
 * holds that recording. Safe to call when nothing is playing.
 */
export function stopPlayback(key?: string): void {
  if (key !== undefined && state.key !== key) return;
  if (!element && state === NOTHING) return;
  release();
  positionMs = 0;
  state = NOTHING;
  stateListeners.forEach((listener) => listener());
  positionListeners.forEach((listener) => listener());
}

const subscribeState = (listener: () => void) => {
  stateListeners.add(listener);
  return () => void stateListeners.delete(listener);
};
const subscribePosition = (listener: () => void) => {
  positionListeners.add(listener);
  return () => void positionListeners.delete(listener);
};
const getState = () => state;
const getServerState = () => NOTHING;

/** True while a recording is loaded and hasn't finished: loading, playing, buffering or paused. */
export const inProgress = (status: PlayerStatus) => status === 'loading' || status === 'playing' || status === 'buffering' || status === 'paused';

/**
 * The site's one recording player. `key` and `status` say what it holds, for
 * every component that asks; `play` starts a recording and stops any other.
 */
export function useRecordingPlayer() {
  const id = useId();
  const current = useSyncExternalStore(subscribeState, getState, getServerState);

  // Leaving the page (or the panel) that started a recording stops it.
  useEffect(
    () => () => {
      if (owner === id) stopPlayback();
    },
    [id],
  );

  const playHere = useCallback((key: string, src: string) => play(key, src, id), [id]);
  return { ...current, play: playHere, pause, resume, stop: stopPlayback };
}

/**
 * Where playback is in the recording `key`, in ms, while it is loaded; null
 * otherwise. Only a component that draws the playhead needs it: it changes
 * every frame.
 */
export function usePlaybackPosition(key: string | null): number | null {
  return useSyncExternalStore(
    subscribePosition,
    () => (key !== null && state.key === key && inProgress(state.status) ? positionMs : null),
    () => null,
  );
}
