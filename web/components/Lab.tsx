'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { type RemoteParticipant, type Room, RoomEvent, Track } from 'livekit-client';
import { AccessCodeForm } from '@/components/AccessCodeForm';
import { CallDock, type CallStatus } from '@/components/CallDock';
import { ExperimentPanel, type RunState } from '@/components/ExperimentPanel';
import { LabOutline } from '@/components/LabOutline';
import { MakeItYourOwn } from '@/components/MakeItYourOwn';
import { PilotBanner } from '@/components/PilotBanner';
import { TurnLog } from '@/components/TurnLog';
import { Eyebrow } from '@/components/ui/Bits';
import { ButtonLink } from '@/components/ui/Button';
import { AccessCodeError } from '@/lib/access';
import { CLIPS, EXPERIMENTS, type ExperimentId } from '@/lib/experiments';
import { LabMic } from '@/lib/labMic';
import { withBase } from '@/lib/paths';
import { loadPeaks, type Peaks } from '@/lib/peaks';
import { logPilot, reachStep, requestRoom } from '@/lib/pilot';
import {
  AGENT_STATE_ATTRIBUTE,
  EVENTS_TOPIC,
  type LabEvent,
  type LabPersona,
  type LabSettings,
  type LabState,
  type LoggedEvent,
  type Mode,
  RPC_CUSTOMIZE,
  RPC_GET_STATE,
  RPC_RESET,
  RPC_SET_SETTINGS,
} from '@/lib/protocol';
import { encodeWav, firstSoundMs, type ReplayRun } from '@/lib/replay';
import { createRoom } from '@/lib/room';
import { type ClipKey, RunRecorder, type RunTimeline, speechRuns } from '@/lib/timeline';
import { useLabAccess } from '@/lib/useLabAccess';

type RunKey = `${ExperimentId}-${Mode}`;

// Production settings, except voice isolation: it's billed by the minute, so the
// agent runs it only while Experiment 3's Enhanced setting is on.
const DEFAULT_SETTINGS: LabSettings = {
  turn_detection: 'enhanced',
  interruptions: 'enhanced',
  noise: 'baseline',
  model: 'fast',
};

// On LiveKit's free plan an idle agent is shut down, and the next call starts it
// again, which can take up to 20 seconds. After this long, the page says so.
const SLOW_JOIN_MS = 6_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

class CallEnded extends Error {
  constructor() {
    super('The call ended before the run finished.');
  }
}

/** Each experiment changes one setting and keeps the others as they are by default. */
function settingsFor(experiment: ExperimentId, mode: Mode): LabSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (experiment === 1) settings.turn_detection = mode;
  if (experiment === 2) settings.interruptions = mode;
  if (experiment === 3) settings.noise = mode;
  if (experiment === 4) settings.model = mode === 'enhanced' ? 'reasoning' : 'fast';
  return settings;
}

/** Which of an experiment's two settings is on now. */
function modeOf(experiment: ExperimentId, settings: LabSettings): Mode {
  if (experiment === 1) return settings.turn_detection;
  if (experiment === 2) return settings.interruptions;
  if (experiment === 3) return settings.noise;
  return settings.model === 'reasoning' ? 'enhanced' : 'baseline';
}

/** The test caller's clip for experiments 3 and 4, which play one clip each. */
const SINGLE_CLIP: Partial<Record<ExperimentId, ClipKey>> = { 3: 'cafeBooking', 4: 'saturday' };

/**
 * Development only: saves a finished run, with a recording of it, for the
 * overview's replay. Needs `?capture` on the lab's address and
 * scripts/capture-server.mjs running.
 */
async function saveCapture(
  name: string,
  timeline: RunTimeline,
  events: LoggedEvent[],
  recording: { samples: Float32Array; sampleRate: number } | null,
): Promise<void> {
  const peaks: Partial<Record<ClipKey, Peaks>> = {};
  for (const clip of timeline.clips) peaks[clip.clip] ??= await loadPeaks(clip.clip);
  // Line the recording up with the run's clock on the caller's first word.
  const first = timeline.clips[0];
  const firstPeaks = first ? peaks[first.clip] : undefined;
  const firstWord = firstPeaks ? speechRuns(firstPeaks.values, firstPeaks.step)[0] : undefined;
  const heardAt = recording ? firstSoundMs(recording.samples, recording.sampleRate) : null;
  const offsetMs = first && firstWord && heardAt !== null ? first.start + firstWord.start * 1000 - heardAt : null;
  const { t0Perf: _live, ...saved } = timeline;
  const replay: ReplayRun = {
    v: 1,
    capturedAt: new Date().toISOString(),
    timeline: saved,
    events,
    peaks,
    audio: recording && offsetMs !== null ? { src: `/replay/${name}.wav`, offsetMs: Math.round(offsetMs) } : null,
  };
  if (recording && replay.audio) {
    await fetch(withBase(`/dev-capture/${name}.wav`), { method: 'POST', body: encodeWav(recording.samples, recording.sampleRate) });
  }
  await fetch(withBase(`/dev-capture/${name}.json`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(replay, null, 1),
  });
  console.info(`Saved ${name} for the replay.`);
}

export function Lab() {
  const access = useLabAccess();
  const { rejectCode } = access;
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // A turned-down access code's reason, shown under the code's field rather than in the call bar.
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentPresent, setAgentPresent] = useState(false);
  const [agentState, setAgentState] = useState('');
  const [slowJoin, setSlowJoin] = useState(false);
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [runs, setRuns] = useState<Partial<Record<RunKey, RunState>>>({});
  const [timelines, setTimelines] = useState<Record<string, RunTimeline>>({});
  const [persona, setPersona] = useState<LabPersona | null>(null);
  const [bookingRun, setBookingRun] = useState<RunState | undefined>();
  const [busy, setBusy] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cafeOn, setCafeOn] = useState(false);
  const [predicted, setPredicted] = useState<string[]>([]);

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LabMic | null>(null);
  const agentRef = useRef<RemoteParticipant | null>(null);
  const agentStateRef = useRef('');
  const stateWaiters = useRef(new Set<() => void>());
  const activeRunRef = useRef<string | null>(null);
  const lastActivityRef = useRef(0);
  const repliesRef = useRef(0);
  const eventsRef = useRef<LoggedEvent[]>([]);
  const recorderRef = useRef<{ id: string; recorder: RunRecorder } | null>(null);
  // The agent's clock minus the page's, from the quickest round trip so far.
  const skewRef = useRef<{ skewMs: number; rttMs: number } | null>(null);
  const captureRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      captureRef.current = new URLSearchParams(window.location.search).has('capture');
    }
  }, []);

  /** Shows a problem on the page, and notes it for the pilot. */
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    logPilot({ kind: 'notice', page: 'lab', text });
  }, []);

  /** Copies the recorder's timeline to the page. */
  const publishTimeline = useCallback(() => {
    const active = recorderRef.current;
    if (active) setTimelines((prev) => ({ ...prev, [active.id]: active.recorder.snapshot() }));
  }, []);

  const noteAgentState = useCallback(
    (state: string) => {
      if (state !== agentStateRef.current) lastActivityRef.current = Date.now();
      agentStateRef.current = state;
      setAgentState(state);
      if (recorderRef.current && state) {
        recorderRef.current.recorder.state(state);
        publishTimeline();
      }
      stateWaiters.current.forEach((check) => check());
    },
    [publishTimeline],
  );

  const findAgent = useCallback(
    (r: Room) => {
      const agent = [...r.remoteParticipants.values()].find((p) => p.isAgent) ?? null;
      agentRef.current = agent;
      setAgentPresent(agent !== null);
      noteAgentState(agent?.attributes[AGENT_STATE_ATTRIBUTE] ?? '');
    },
    [noteAgentState],
  );

  const waitForAgentState = useCallback(
    (states: string[], timeoutMs: number) =>
      new Promise<boolean>((resolve) => {
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          stateWaiters.current.delete(check);
          resolve(ok);
        };
        const check = () => {
          if (states.includes(agentStateRef.current)) finish(true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        stateWaiters.current.add(check);
        check();
      }),
    [],
  );

  /** Throws if the learner left the call, so a run stops at once instead of timing out. */
  const stillOnCall = useCallback(() => {
    if (!roomRef.current) throw new CallEnded();
  }, []);

  /** Resolves once the agent has been listening, with no new turns, for quietMs. */
  const waitForQuiet = useCallback(
    async (quietMs: number, timeoutMs: number) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        stillOnCall();
        const listening = agentStateRef.current === 'listening';
        if (listening && Date.now() - lastActivityRef.current >= quietMs) return true;
        await sleep(200);
      }
      return false;
    },
    [stillOnCall],
  );

  /**
   * After the caller finishes: wait for Juniper's answer, then for the call to go
   * quiet. When a setting works, nothing happens during the clip itself, so a
   * run can't end on silence alone.
   */
  const waitForAnswer = useCallback(async () => {
    const repliesBefore = repliesRef.current;
    lastActivityRef.current = Date.now();
    const started = Date.now();
    while (repliesRef.current === repliesBefore && Date.now() - started < 15_000) {
      stillOnCall();
      await sleep(200);
    }
    await waitForQuiet(2_500, 30_000);
  }, [stillOnCall, waitForQuiet]);

  const handleEvent = useCallback(
    (event: LabEvent) => {
      lastActivityRef.current = Date.now();
      if (event.type === 'time_limit') {
        showNotice(
          `This lab session reached its ${event.minutes}-minute limit, so it ended. Press Call Juniper to start a fresh one.`,
        );
        logPilot({ kind: 'call', page: 'lab', state: 'time_limit' });
        return;
      }
      if (event.type === 'turn' && event.role === 'assistant') repliesRef.current += 1;
      const logged = { ...event, runId: activeRunRef.current, receivedAt: Date.now() };
      eventsRef.current = [...eventsRef.current, logged];
      setEvents(eventsRef.current);
    },
    [showNotice],
  );

  const callAgent = useCallback(async (method: string, payload: object) => {
    const r = roomRef.current;
    const agent = agentRef.current;
    if (!r || !agent) throw new Error('Juniper hasn’t joined the room yet.');
    const response = await r.localParticipant.performRpc({
      destinationIdentity: agent.identity,
      method,
      payload: JSON.stringify(payload),
      responseTimeout: 10_000,
    });
    const next = JSON.parse(response) as LabState;
    setSettings(next.settings);
    setPersona(next.persona);
    return next;
  }, []);

  /** Reads the agent's clock with a quick RPC, to place its speech times on the page's timeline. */
  const measureSkew = useCallback(async () => {
    const sent = Date.now();
    const state = await callAgent(RPC_GET_STATE, {});
    const received = Date.now();
    if (typeof state.now !== 'number') return;
    const rttMs = received - sent;
    const skewMs = state.now * 1000 - (sent + received) / 2;
    if (!skewRef.current || rttMs < skewRef.current.rttMs) skewRef.current = { skewMs, rttMs };
  }, [callAgent]);

  // Once Juniper joins, ask for its state: the page learns who Juniper is playing and the
  // settings in use before any other call, and gets a first reading of the agent's clock.
  useEffect(() => {
    if (status === 'connected' && agentPresent) void measureSkew().catch(() => undefined);
  }, [status, agentPresent, measureSkew]);

  const disconnect = useCallback(async () => {
    const r = roomRef.current;
    const mic = micRef.current;
    if (r) logPilot({ kind: 'call', page: 'lab', state: 'ended' });
    roomRef.current = null;
    micRef.current = null;
    agentRef.current = null;
    skewRef.current = null;
    setRoom(null);
    setAgentPresent(false);
    setPersona(null);
    // The next call's agent starts on its defaults, so the page does too.
    setSettings(DEFAULT_SETTINGS);
    setMicOn(false);
    setCafeOn(false);
    setStatus('idle');
    noteAgentState('');
    await r?.disconnect();
    await mic?.close();
  }, [noteAgentState]);

  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
      void micRef.current?.close();
    },
    [],
  );

  // Say so when the agent is slow to join, which happens when it was asleep.
  useEffect(() => {
    if (status !== 'connected' || agentPresent) {
      setSlowJoin(false);
      return;
    }
    const timer = setTimeout(() => setSlowJoin(true), SLOW_JOIN_MS);
    return () => clearTimeout(timer);
  }, [status, agentPresent]);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    setNotice(null);
    // Created inside the click, so the browser allows it to play audio.
    const mic = new LabMic();
    let joined: Room | null = null;
    try {
      await mic.resume();
      const { serverUrl, participantToken } = await requestRoom('lab');

      const r = createRoom();
      joined = r;
      r.registerTextStreamHandler(EVENTS_TOPIC, async (reader) => {
        try {
          handleEvent(JSON.parse(await reader.readAll()) as LabEvent);
        } catch (err) {
          console.warn('Ignored a lab event that wasn’t valid JSON', err);
        }
      });
      r.on(RoomEvent.ParticipantConnected, () => findAgent(r))
        .on(RoomEvent.ParticipantDisconnected, () => findAgent(r))
        .on(RoomEvent.ParticipantAttributesChanged, () => findAgent(r))
        // Only this call's own room ends it: a late event from the last call's room is ignored.
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current === r) void disconnect();
        });

      await r.connect(serverUrl, participantToken);
      await r.localParticipant.publishTrack(mic.track, {
        source: Track.Source.Microphone,
        name: 'lab-mic',
        dtx: false,
      });
      await r.startAudio();

      micRef.current = mic;
      roomRef.current = r;
      lastActivityRef.current = Date.now();
      setRoom(r);
      setStatus('connected');
      findAgent(r);
      logPilot({ kind: 'call', page: 'lab', state: 'connected' });
    } catch (err) {
      // A step after joining failed (the microphone track, or audio playback): leave the
      // room too, quietly, so it doesn't stay connected with nobody on the page.
      if (joined) {
        joined.removeAllListeners();
        await joined.disconnect().catch(() => undefined);
      }
      await mic.close();
      setStatus('error');
      if (err instanceof AccessCodeError) {
        rejectCode();
        setCodeError(message(err));
      } else {
        setError(message(err));
      }
      logPilot({ kind: 'notice', page: 'lab', text: message(err) });
    }
  }, [disconnect, findAgent, handleEvent, rejectCode]);

  const toggleMic = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    try {
      await mic.setMicEnabled(!micOn);
      setMicOn(!micOn);
    } catch (err) {
      showNotice(`Your microphone isn’t available: ${message(err)}`);
    }
  }, [micOn, showNotice]);

  const toggleCafe = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    try {
      await mic.setCafe(cafeOn ? null : CLIPS.cafe);
      setCafeOn(!cafeOn);
    } catch (err) {
      showNotice(message(err));
    }
  }, [cafeOn, showNotice]);

  const setMode = useCallback(
    async (experiment: ExperimentId, mode: Mode) => {
      setBusy(true);
      setNotice(null);
      try {
        await callAgent(RPC_SET_SETTINGS, settingsFor(experiment, mode));
      } catch (err) {
        showNotice(message(err));
      } finally {
        setBusy(false);
      }
    },
    [callAgent, showNotice],
  );

  /** Starts recording a run's timeline (and, in development with ?capture, its audio). */
  const startRecording = useCallback(
    (id: string, experiment: ExperimentId | 0, mode: Mode | null) => {
      const recorder = new RunRecorder({
        experiment,
        mode,
        skewMs: skewRef.current?.skewMs ?? null,
        state: agentStateRef.current,
      });
      recorderRef.current = { id, recorder };
      publishTimeline();
      if (captureRef.current) {
        const track = agentRef.current?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
        micRef.current?.startCapture(track);
      }
      return recorder;
    },
    [publishTimeline],
  );

  /** Plays one clip into the call and marks it on the run's timeline. */
  const play = useCallback(
    async (recorder: RunRecorder, clip: ClipKey) => {
      const mic = micRef.current;
      if (!mic) throw new CallEnded();
      const playing = await mic.startClip(CLIPS[clip]);
      recorder.clip(clip, playing.startedAt, playing.duration);
      publishTimeline();
      await playing.ended;
      stillOnCall();
    },
    [publishTimeline, stillOnCall],
  );

  /** Ends the run's recording; saves it for the replay when capturing. */
  const stopRecording = useCallback(
    (id: string, status: 'done' | 'failed', name: string | null) => {
      const active = recorderRef.current;
      if (!active || active.id !== id) return;
      active.recorder.finish(status);
      publishTimeline();
      recorderRef.current = null;
      const recording = micRef.current?.stopCapture() ?? null;
      if (process.env.NODE_ENV === 'development' && captureRef.current && status === 'done' && name) {
        const runEvents = eventsRef.current.filter((e) => e.runId === id);
        saveCapture(name, active.recorder.snapshot(), runEvents, recording).catch((err) =>
          console.warn('The replay capture wasn’t saved. Is scripts/capture-server.mjs running?', err),
        );
      }
    },
    [publishTimeline],
  );

  const runTestCaller = useCallback(
    async (experiment: ExperimentId, mode: Mode) => {
      if (!micRef.current) return;
      const key: RunKey = `${experiment}-${mode}`;
      const id = crypto.randomUUID();
      const section = `Experiment ${experiment}`;
      let outcome: 'done' | 'failed' = 'failed';
      setBusy(true);
      setNotice(null);
      setRuns((prev) => ({ ...prev, [key]: { id, status: 'running' } }));
      micRef.current.setHold(true);
      try {
        await callAgent(RPC_SET_SETTINGS, settingsFor(experiment, mode));
        await callAgent(RPC_RESET, {});
        activeRunRef.current = id;
        await waitForAgentState(['listening'], 8_000);
        await measureSkew().catch(() => undefined);
        const recorder = startRecording(id, experiment, mode);
        await sleep(300);
        stillOnCall();
        const clip = SINGLE_CLIP[experiment];
        if (clip) {
          await play(recorder, clip);
        } else if (experiment === 1) {
          await play(recorder, 'tableBooking');
        } else {
          await play(recorder, 'menuQuestion');
          if (!(await waitForAgentState(['speaking'], 15_000))) {
            stillOnCall();
            throw new Error('Juniper didn’t start answering the menu question.');
          }
          for (const next of ['uhHuh', 'uhHuh', 'vegetarian'] as const) {
            await sleep(2_500);
            stillOnCall();
            await play(recorder, next);
          }
        }
        await waitForAnswer();
        outcome = 'done';
        setRuns((prev) => ({ ...prev, [key]: { id, status: 'done' } }));
        logPilot({ kind: 'run', section, mode, status: 'done' });
      } catch (err) {
        setRuns((prev) => ({ ...prev, [key]: { id, status: 'failed' } }));
        logPilot({ kind: 'run', section, mode, status: 'failed' });
        showNotice(message(err));
      } finally {
        stopRecording(id, outcome, `exp${experiment}-${mode}`);
        activeRunRef.current = null;
        micRef.current?.setHold(false);
        setBusy(false);
      }
    },
    [callAgent, measureSkew, play, showNotice, startRecording, stillOnCall, stopRecording, waitForAgentState, waitForAnswer],
  );

  /** Calls the agent with the page marked busy, and shows any error. Returns whether it worked. */
  const withAgent = useCallback(
    async (method: string, payload: object) => {
      setBusy(true);
      setNotice(null);
      try {
        await callAgent(method, payload);
        return true;
      } catch (err) {
        showNotice(message(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [callAgent, showNotice],
  );

  const applyPersona = useCallback(
    async (name: string, rule: string) => {
      const worked = await withAgent(RPC_CUSTOMIZE, { name, rule });
      if (worked) logPilot({ kind: 'customize', name, rule });
      return worked;
    },
    [withAgent],
  );
  const restorePersona = useCallback(async () => {
    await withAgent(RPC_CUSTOMIZE, { reset: true });
  }, [withAgent]);
  const loadState = useCallback(async () => {
    await withAgent(RPC_GET_STATE, {});
  }, [withAgent]);

  /** The test caller books a table with whatever restaurant Juniper is playing now. */
  const runBooking = useCallback(async () => {
    if (!micRef.current) return;
    const id = crypto.randomUUID();
    const section = 'Make it your own: test caller’s booking';
    let outcome: 'done' | 'failed' = 'failed';
    setBusy(true);
    setNotice(null);
    setBookingRun({ id, status: 'running' });
    micRef.current.setHold(true);
    try {
      activeRunRef.current = id;
      await waitForAgentState(['listening'], 8_000);
      await measureSkew().catch(() => undefined);
      const recorder = startRecording(id, 0, null);
      await sleep(300);
      stillOnCall();
      await play(recorder, 'tableBooking');
      await waitForAnswer();
      outcome = 'done';
      setBookingRun({ id, status: 'done' });
      logPilot({ kind: 'run', section, status: 'done' });
    } catch (err) {
      setBookingRun({ id, status: 'failed' });
      logPilot({ kind: 'run', section, status: 'failed' });
      showNotice(message(err));
    } finally {
      stopRecording(id, outcome, null);
      activeRunRef.current = null;
      micRef.current?.setHold(false);
      setBusy(false);
    }
  }, [measureSkew, play, showNotice, startRecording, stillOnCall, stopRecording, waitForAgentState, waitForAnswer]);

  const ready = status === 'connected' && agentPresent;
  const predict = (section: string) => (choice: string, correct: boolean) => {
    setPredicted((prev) => (prev.includes(section) ? prev : [...prev, section]));
    logPilot({ kind: 'prediction', section, choice, correct });
  };
  const viewOf = (state: RunState | undefined) => ({
    state,
    events: state ? events.filter((e) => e.runId === state.id) : [],
    timeline: state ? timelines[state.id] : undefined,
  });
  const bothDone = (id: ExperimentId) =>
    runs[`${id}-baseline`]?.status === 'done' && runs[`${id}-enhanced`]?.status === 'done';

  return (
    <RoomContext.Provider value={room ?? undefined}>
      <main id="main" className="page-column">
        {access.pilot && (
          <div className="pt-6">
            <PilotBanner pilot={access.pilot} page="lab" />
          </div>
        )}

        <header className="flex flex-col gap-[18px] pt-14 pb-10 sm:pt-16">
          <Eyebrow>Seller Lab 1 · The lab</Eyebrow>
          <h1 className="display text-page-title leading-page">Why real-time voice AI is hard</h1>
          <p className="max-w-[700px] text-lead leading-reading tracking-body">
            Juniper is a LiveKit voice agent that answers the phone for a made-up restaurant. First you make it your
            own. Then each experiment plays a recorded test caller through two settings, so you hear the difference
            with the same input, and you try it with your own voice. Use headphones.
          </p>
          <p className="m-0 text-card text-subtle">
            At the end, put it to work on{' '}
            <Link href="/practice/" onClick={() => reachStep('practice')} className="font-semibold text-accent hover:underline">
              a scored practice call
            </Link>
            .
          </p>
        </header>

        {access.ready && !access.hasCode && (
          <div className="pb-8">
            <AccessCodeForm
              error={codeError}
              onSave={(code) => {
                access.saveCode(code);
                // The old code's error no longer applies.
                setError(null);
                setCodeError(null);
                // The form goes away, so focus moves on to the call.
                requestAnimationFrame(() => document.getElementById('call-button')?.focus());
              }}
            />
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
          <LabOutline
            items={[
              {
                id: 'make-it-your-own',
                label: 'Make it your own',
                done: predicted.includes('Make it your own') && bookingRun?.status === 'done',
              },
              ...EXPERIMENTS.map((experiment) => ({
                id: `experiment-${experiment.id}`,
                label: `${experiment.id} · ${experiment.title.replace(/^Experiment \d+:\s*/, '')}`,
                done: predicted.includes(`Experiment ${experiment.id}`) && bothDone(experiment.id),
              })),
              { id: 'prove-it', label: 'Prove it: the practice call', done: false },
              { id: 'every-turn', label: 'Every turn, measured', done: false },
            ]}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <MakeItYourOwn
              persona={persona}
              canAct={ready && !busy}
              run={viewOf(bookingRun)}
              onApply={applyPersona}
              onRestore={restorePersona}
              onPlayBooking={() => void runBooking()}
              onLoad={loadState}
              onPredict={predict('Make it your own')}
            />

            {EXPERIMENTS.map((experiment) => (
              <ExperimentPanel
                key={experiment.id}
                experiment={experiment}
                currentMode={modeOf(experiment.id, settings)}
                runs={{
                  baseline: viewOf(runs[`${experiment.id}-baseline`]),
                  enhanced: viewOf(runs[`${experiment.id}-enhanced`]),
                }}
                canRun={ready && !busy}
                onRun={(mode) => void runTestCaller(experiment.id, mode)}
                onSetMode={(mode) => void setMode(experiment.id, mode)}
                onPredict={predict(`Experiment ${experiment.id}`)}
                cafe={experiment.id === 3 ? { on: cafeOn, onToggle: () => void toggleCafe() } : undefined}
              />
            ))}

            <section
              id="prove-it"
              aria-labelledby="prove-it-title"
              className="flex scroll-mt-6 flex-wrap items-center gap-x-6 gap-y-4 rounded-lg border border-line p-6"
            >
              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1.5">
                <h2 id="prove-it-title" className="m-0 text-xl font-normal text-fg">
                  Prove it: the practice call
                </h2>
                <p className="m-0 text-sm leading-relaxed">
                  An 8 to 10 minute discovery call with Priya, an AI voice agent playing a buyer. It’s scored on what this
                  lab teaches, and a coach talks you through the result.
                </p>
              </div>
              <ButtonLink href="/practice/" variant="primary" onClick={() => reachStep('practice')}>
                Go to the practice call
              </ButtonLink>
            </section>

            <TurnLog events={events} />

            {!access.pilot && (
              <p className="m-0 text-xs text-subtle">Calls in this lab aren’t recorded. Each one ends on its own after 40 minutes.</p>
            )}
          </div>
        </div>

        <CallDock
          status={status}
          hasRoom={room !== null}
          agentPresent={agentPresent}
          agentState={agentState}
          slowJoin={slowJoin}
          settings={settings}
          persona={persona ? (persona.custom ? persona.name : 'The original Juniper') : null}
          micOn={micOn}
          busy={busy}
          message={error ?? notice}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onToggleMic={() => void toggleMic()}
        />
      </main>
      {room && <RoomAudioRenderer />}
    </RoomContext.Provider>
  );
}
