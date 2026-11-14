'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { type RemoteParticipant, Room, RoomEvent, Track } from 'livekit-client';
import { AccessCodeForm } from '@/components/AccessCodeForm';
import { ExperimentPanel, type RunState } from '@/components/ExperimentPanel';
import { MakeItYourOwn } from '@/components/MakeItYourOwn';
import { PilotBanner } from '@/components/PilotBanner';
import { TurnLog } from '@/components/TurnLog';
import { AccessCodeError } from '@/lib/access';
import { CLIPS, EXPERIMENTS, type ExperimentId } from '@/lib/experiments';
import { LabMic } from '@/lib/labMic';
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
import { useLabAccess } from '@/lib/useLabAccess';

type Status = 'idle' | 'connecting' | 'connected' | 'error';
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
const SINGLE_CLIP: Partial<Record<ExperimentId, string>> = { 3: CLIPS.cafeBooking, 4: CLIPS.saturday };

export function Lab() {
  const access = useLabAccess();
  const { rejectCode } = access;
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentPresent, setAgentPresent] = useState(false);
  const [agentState, setAgentState] = useState('');
  const [slowJoin, setSlowJoin] = useState(false);
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [runs, setRuns] = useState<Partial<Record<RunKey, RunState>>>({});
  const [persona, setPersona] = useState<LabPersona | null>(null);
  const [bookingRun, setBookingRun] = useState<RunState | undefined>();
  const [busy, setBusy] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cafeOn, setCafeOn] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LabMic | null>(null);
  const agentRef = useRef<RemoteParticipant | null>(null);
  const agentStateRef = useRef('');
  const stateWaiters = useRef(new Set<() => void>());
  const activeRunRef = useRef<string | null>(null);
  const lastActivityRef = useRef(0);
  const repliesRef = useRef(0);

  /** Shows a problem on the page, and notes it for the pilot. */
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    logPilot({ kind: 'notice', page: 'lab', text });
  }, []);

  const noteAgentState = useCallback((state: string) => {
    if (state !== agentStateRef.current) lastActivityRef.current = Date.now();
    agentStateRef.current = state;
    setAgentState(state);
    stateWaiters.current.forEach((check) => check());
  }, []);

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

  /** Resolves once the agent has been listening, with no new turns, for quietMs. */
  const waitForQuiet = useCallback(async (quietMs: number, timeoutMs: number) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const listening = agentStateRef.current === 'listening';
      if (listening && Date.now() - lastActivityRef.current >= quietMs) return true;
      await sleep(200);
    }
    return false;
  }, []);

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
      await sleep(200);
    }
    await waitForQuiet(2_500, 30_000);
  }, [waitForQuiet]);

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
      setEvents((prev) => [...prev, { ...event, runId: activeRunRef.current, receivedAt: Date.now() }]);
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

  const disconnect = useCallback(async () => {
    const r = roomRef.current;
    const mic = micRef.current;
    if (r) logPilot({ kind: 'call', page: 'lab', state: 'ended' });
    roomRef.current = null;
    micRef.current = null;
    agentRef.current = null;
    setRoom(null);
    setAgentPresent(false);
    setPersona(null);
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
    try {
      await mic.resume();
      const { serverUrl, participantToken } = await requestRoom('lab');

      const r = new Room();
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
        .on(RoomEvent.Disconnected, () => void disconnect());

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
      await mic.close();
      setStatus('error');
      if (err instanceof AccessCodeError) rejectCode();
      setError(message(err));
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

  const runTestCaller = useCallback(
    async (experiment: ExperimentId, mode: Mode) => {
      const mic = micRef.current;
      if (!mic) return;
      const key: RunKey = `${experiment}-${mode}`;
      const id = crypto.randomUUID();
      const section = `Experiment ${experiment}`;
      setBusy(true);
      setNotice(null);
      setRuns((prev) => ({ ...prev, [key]: { id, status: 'running' } }));
      mic.setHold(true);
      try {
        await callAgent(RPC_SET_SETTINGS, settingsFor(experiment, mode));
        await callAgent(RPC_RESET, {});
        activeRunRef.current = id;
        await waitForAgentState(['listening'], 8_000);
        await sleep(300);
        const clip = SINGLE_CLIP[experiment];
        if (clip) {
          await mic.playClip(clip);
        } else if (experiment === 1) {
          await mic.playClip(CLIPS.tableBooking);
        } else {
          await mic.playClip(CLIPS.menuQuestion);
          if (!(await waitForAgentState(['speaking'], 15_000))) {
            throw new Error('Juniper didn’t start answering the menu question.');
          }
          for (const clip of [CLIPS.uhHuh, CLIPS.uhHuh, CLIPS.vegetarian]) {
            await sleep(2_500);
            await mic.playClip(clip);
          }
        }
        await waitForAnswer();
        setRuns((prev) => ({ ...prev, [key]: { id, status: 'done' } }));
        logPilot({ kind: 'run', section, mode, status: 'done' });
      } catch (err) {
        setRuns((prev) => ({ ...prev, [key]: { id, status: 'failed' } }));
        logPilot({ kind: 'run', section, mode, status: 'failed' });
        showNotice(message(err));
      } finally {
        activeRunRef.current = null;
        mic.setHold(false);
        setBusy(false);
      }
    },
    [callAgent, showNotice, waitForAgentState, waitForAnswer],
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
      if (await withAgent(RPC_CUSTOMIZE, { name, rule })) logPilot({ kind: 'customize', name, rule });
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
    const mic = micRef.current;
    if (!mic) return;
    const id = crypto.randomUUID();
    const section = 'Make it your own: test caller’s booking';
    setBusy(true);
    setNotice(null);
    setBookingRun({ id, status: 'running' });
    mic.setHold(true);
    try {
      activeRunRef.current = id;
      await waitForAgentState(['listening'], 8_000);
      await sleep(300);
      await mic.playClip(CLIPS.tableBooking);
      await waitForAnswer();
      setBookingRun({ id, status: 'done' });
      logPilot({ kind: 'run', section, status: 'done' });
    } catch (err) {
      setBookingRun({ id, status: 'failed' });
      logPilot({ kind: 'run', section, status: 'failed' });
      showNotice(message(err));
    } finally {
      activeRunRef.current = null;
      mic.setHold(false);
      setBusy(false);
    }
  }, [showNotice, waitForAgentState, waitForAnswer]);

  const ready = status === 'connected' && agentPresent;
  const predict = (section: string) => (choice: string, correct: boolean) =>
    logPilot({ kind: 'prediction', section, choice, correct });

  return (
    <RoomContext.Provider value={room ?? undefined}>
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
        {access.pilot && <PilotBanner pilot={access.pilot} page="lab" />}

        <header className="space-y-3">
          <p className="text-sm font-medium tracking-wide text-accent uppercase">Seller Lab 1</p>
          <h1 className="text-3xl font-semibold tracking-tight">Why real-time voice AI is hard</h1>
          <p className="max-w-2xl text-stone-600">
            Juniper is a LiveKit voice agent that answers the phone for a made-up restaurant. First
            you make it your own. Then each experiment plays a recorded test caller through two
            settings, so you hear the difference with the same input, and you try it with your own
            voice. Use headphones.
          </p>
          <p className="text-sm text-stone-600">
            At the end, put it to work on{' '}
            <Link
              href="/practice/"
              onClick={() => reachStep('practice')}
              className="font-medium text-accent hover:underline"
            >
              a scored practice call
            </Link>
            .
          </p>
        </header>

        {access.ready && !access.hasCode && <AccessCodeForm onSave={access.saveCode} />}

        <ConnectionBar
          status={status}
          ready={ready}
          agentPresent={agentPresent}
          agentState={agentState}
          slowJoin={slowJoin}
          settings={settings}
          micOn={micOn}
          busy={busy}
          onConnect={connect}
          onDisconnect={disconnect}
          onToggleMic={toggleMic}
        />

        {(error || notice) && (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error ?? notice}
          </p>
        )}

        <MakeItYourOwn
          persona={persona}
          canAct={ready && !busy}
          run={{
            state: bookingRun,
            events: bookingRun ? events.filter((e) => e.runId === bookingRun.id) : [],
          }}
          onApply={applyPersona}
          onRestore={restorePersona}
          onPlayBooking={() => void runBooking()}
          onLoad={loadState}
          onPredict={predict('Make it your own')}
        />

        {EXPERIMENTS.map((experiment) => {
          const view = (mode: Mode) => {
            const state = runs[`${experiment.id}-${mode}`];
            return { state, events: state ? events.filter((e) => e.runId === state.id) : [] };
          };
          return (
            <ExperimentPanel
              key={experiment.id}
              experiment={experiment}
              currentMode={modeOf(experiment.id, settings)}
              runs={{ baseline: view('baseline'), enhanced: view('enhanced') }}
              canRun={ready && !busy}
              onRun={(mode) => void runTestCaller(experiment.id, mode)}
              onSetMode={(mode) => void setMode(experiment.id, mode)}
              onPredict={predict(`Experiment ${experiment.id}`)}
              cafe={experiment.id === 3 ? { on: cafeOn, onToggle: () => void toggleCafe() } : undefined}
            />
          );
        })}

        <section className="space-y-2 rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-semibold">Prove it: the practice call</h2>
          <p className="text-stone-600">
            An 8 to 10 minute discovery call with Priya, an AI voice agent playing a buyer. It’s scored
            on what this lab teaches, and a coach talks you through the result.
          </p>
          <Link
            href="/practice/"
            onClick={() => reachStep('practice')}
            className="inline-block rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white"
          >
            Go to the practice call
          </Link>
        </section>

        <TurnLog events={events} />

        {!access.pilot && (
          <footer className="border-t border-stone-200 pt-4 text-xs text-stone-500">
            Calls in this lab aren’t recorded. Each one ends on its own after 40 minutes.
          </footer>
        )}
      </main>
      {room && <RoomAudioRenderer />}
    </RoomContext.Provider>
  );
}

const MODE_LABEL: Record<Mode, string> = { baseline: 'Baseline', enhanced: 'Enhanced' };

function ConnectionBar(props: {
  status: Status;
  ready: boolean;
  agentPresent: boolean;
  agentState: string;
  slowJoin: boolean;
  settings: LabSettings;
  micOn: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMic: () => void;
}) {
  const { status, ready, agentPresent, agentState, slowJoin, settings, micOn, busy } = props;
  const connected = status === 'connected';
  const label = !connected
    ? status === 'connecting'
      ? 'Connecting…'
      : 'Not connected'
    : agentPresent
      ? `Juniper is ${agentState || 'joining'}`
      : slowJoin
        ? 'Waiting for Juniper to join. After a quiet spell this can take up to 20 seconds.'
        : 'Waiting for Juniper to join…';

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
      <span className="flex items-center gap-2 text-sm" aria-live="polite">
        <span
          className={`size-2.5 shrink-0 rounded-full ${ready ? 'bg-emerald-500' : connected ? 'bg-amber-400' : 'bg-stone-300'}`}
          aria-hidden
        />
        {label}
      </span>
      {connected && (
        <span className="text-sm text-stone-500">
          Turn detection: {MODE_LABEL[settings.turn_detection]} · Interruptions:{' '}
          {MODE_LABEL[settings.interruptions]} · Voice isolation: {settings.noise === 'enhanced' ? 'on' : 'off'} ·
          Model: {settings.model === 'reasoning' ? 'reasoning' : 'fast'}
        </span>
      )}
      <span className="ml-auto flex gap-2">
        {connected && (
          <button
            type="button"
            onClick={props.onToggleMic}
            disabled={busy}
            aria-pressed={micOn}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              micOn ? 'border-accent bg-accent-soft text-accent' : 'border-stone-300 bg-white'
            }`}
          >
            {micOn ? 'Your microphone is on' : 'Use my voice'}
          </button>
        )}
        {connected ? (
          <button
            type="button"
            onClick={props.onDisconnect}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium"
          >
            Leave
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onConnect}
            disabled={status === 'connecting'}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Call Juniper
          </button>
        )}
      </span>
    </section>
  );
}
