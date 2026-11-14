'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { type RemoteParticipant, Room, RoomEvent } from 'livekit-client';
import { AccessCodeForm } from '@/components/AccessCodeForm';
import { PilotBanner } from '@/components/PilotBanner';
import { AccessCodeError } from '@/lib/access';
import { logPilot, requestRoom } from '@/lib/pilot';
import {
  BRIEF,
  CHAT_TOPIC,
  clock,
  MAX_TYPED_CHARS,
  PASS_MARK,
  type PracticeTurn,
  RPC_FINISH,
  RUBRIC,
  SCORECARD_TOPIC,
  type Scorecard,
  type ScorecardMessage,
} from '@/lib/practice';
import { AGENT_STATE_ATTRIBUTE, EVENTS_TOPIC, type TimeLimitEvent } from '@/lib/protocol';
import { useLabAccess } from '@/lib/useLabAccess';

/**
 * idle: no call. connecting: getting a room. live: talking to Priya.
 * scoring: the call is over and the judge is scoring it.
 * scored, empty, failed: how the scoring ended.
 */
type Phase = 'idle' | 'connecting' | 'live' | 'scoring' | 'scored' | 'empty' | 'failed';

const WRAP_UP_AFTER_S = 8 * 60;
// After this long without Priya, say that a sleeping agent takes a while to start.
const SLOW_JOIN_MS = 6_000;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The call as the pilot results show it, from the turns the page received. */
function transcriptOf(turns: PracticeTurn[]) {
  return [...turns]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => ({
      time: clock(t.createdAt - t.callStartedAt),
      who: t.role === 'user' ? 'Seller' : (t.agent ?? 'Priya'),
      text: t.text,
    }));
}

export function PracticeCall() {
  const access = useLabAccess();
  const { rejectCode } = access;
  const [room, setRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentPresent, setAgentPresent] = useState(false);
  const [agentState, setAgentState] = useState('');
  const [turns, setTurns] = useState<PracticeTurn[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [totals, setTotals] = useState<number[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [slowJoin, setSlowJoin] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const agentRef = useRef<RemoteParticipant | null>(null);
  const turnsRef = useRef<PracticeTurn[]>([]);
  turnsRef.current = turns;

  /** Shows a problem on the page, and notes it for the pilot. */
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    logPilot({ kind: 'notice', page: 'practice', text });
  }, []);

  const findAgent = useCallback((r: Room) => {
    const agent = [...r.remoteParticipants.values()].find((p) => p.isAgent) ?? null;
    agentRef.current = agent;
    setAgentPresent(agent !== null);
    setAgentState(agent?.attributes[AGENT_STATE_ATTRIBUTE] ?? '');
  }, []);

  const disconnect = useCallback(async () => {
    const r = roomRef.current;
    if (r) logPilot({ kind: 'call', page: 'practice', state: 'ended' });
    roomRef.current = null;
    agentRef.current = null;
    setRoom(null);
    setAgentPresent(false);
    setAgentState('');
    setMicOn(false);
    // Leaving before the scorecard arrives ends the attempt. A scorecard stays.
    setPhase((p) => (p === 'live' || p === 'connecting' || p === 'scoring' ? 'idle' : p));
    await r?.disconnect();
  }, []);

  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
    },
    [],
  );

  const connect = useCallback(async () => {
    setPhase('connecting');
    setError(null);
    setNotice(null);
    setTurns([]);
    setScorecard(null);
    try {
      const { serverUrl, participantToken } = await requestRoom('practice');

      const r = new Room();
      r.registerTextStreamHandler(EVENTS_TOPIC, async (reader) => {
        try {
          const event = JSON.parse(await reader.readAll()) as PracticeTurn | TimeLimitEvent;
          if (event.type === 'time_limit') {
            showNotice(
              `This practice call reached its ${event.minutes}-minute limit, so it ended. Call Priya again to start a fresh one.`,
            );
            logPilot({ kind: 'call', page: 'practice', state: 'time_limit' });
            return;
          }
          if (event.type !== 'turn') return;
          setTurns((prev) => (prev.some((t) => t.id === event.id) ? prev : [...prev, event]));
        } catch (err) {
          console.warn('Ignored a call event that wasn’t valid JSON', err);
        }
      });
      r.registerTextStreamHandler(SCORECARD_TOPIC, async (reader) => {
        try {
          const result = JSON.parse(await reader.readAll()) as ScorecardMessage;
          if (result.status === 'done') {
            const { status: _, ...card } = result;
            setScorecard(card);
            setTotals((prev) => [...prev, card.total]);
            setPhase('scored');
            logPilot({ kind: 'scorecard', card, transcript: transcriptOf(turnsRef.current) });
          } else if (result.status === 'failed') {
            setPhase('failed');
            logPilot({ kind: 'notice', page: 'practice', text: 'The call couldn’t be scored.' });
          }
        } catch (err) {
          console.warn('Ignored a scorecard that wasn’t valid JSON', err);
        }
      });
      r.on(RoomEvent.ParticipantConnected, () => findAgent(r))
        .on(RoomEvent.ParticipantDisconnected, () => findAgent(r))
        .on(RoomEvent.ParticipantAttributesChanged, () => findAgent(r))
        .on(RoomEvent.Disconnected, () => void disconnect());

      await r.connect(serverUrl, participantToken);
      await r.startAudio();
      roomRef.current = r;
      setRoom(r);
      setPhase('live');
      setStartedAt(Date.now());
      setNow(Date.now());
      findAgent(r);
      logPilot({ kind: 'call', page: 'practice', state: 'connected' });
      // The call doesn't wait for the microphone: without one, the learner types.
      r.localParticipant
        .setMicrophoneEnabled(true)
        .then(() => setMicOn(true))
        .catch(() => showNotice('Your microphone isn’t available, so type your side of the call below.'));
    } catch (err) {
      setPhase('idle');
      if (err instanceof AccessCodeError) rejectCode();
      setError(message(err));
      logPilot({ kind: 'notice', page: 'practice', text: message(err) });
    }
  }, [disconnect, findAgent, rejectCode, showNotice]);

  const toggleMic = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
    } catch (err) {
      showNotice(`Your microphone isn’t available: ${message(err)}`);
    }
  }, [micOn, showNotice]);

  const sendTyped = useCallback(async () => {
    const r = roomRef.current;
    const text = typed.trim();
    if (!r || !text) return;
    setTyped('');
    try {
      await r.localParticipant.sendText(text, { topic: CHAT_TOPIC });
    } catch (err) {
      setTyped(text);
      showNotice(`That message didn’t send: ${message(err)}`);
    }
  }, [showNotice, typed]);

  const finish = useCallback(async () => {
    const r = roomRef.current;
    const agent = agentRef.current;
    if (!r || !agent) return;
    setNotice(null);
    setPhase('scoring');
    if (micOn) {
      // The call is over, so stop sending your voice.
      void r.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      setMicOn(false);
    }
    try {
      const response = await r.localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: RPC_FINISH,
        payload: '{}',
        responseTimeout: 10_000,
      });
      const { status } = JSON.parse(response) as { status: string };
      if (status === 'empty') setPhase((p) => (p === 'scoring' ? 'empty' : p));
    } catch (err) {
      setPhase('live');
      showNotice(`The call didn’t end: ${message(err)}`);
    }
  }, [micOn, showNotice]);

  const callAgain = useCallback(async () => {
    await disconnect();
    await connect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [phase]);

  const connected = room !== null;
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;

  // Say so when Priya is slow to join, which happens when the agent was asleep.
  useEffect(() => {
    if (!connected || agentPresent) {
      setSlowJoin(false);
      return;
    }
    const timer = setTimeout(() => setSlowJoin(true), SLOW_JOIN_MS);
    return () => clearTimeout(timer);
  }, [connected, agentPresent]);

  return (
    <RoomContext.Provider value={room ?? undefined}>
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
        {access.pilot && <PilotBanner pilot={access.pilot} page="practice" />}
        <header className="space-y-3">
          <p className="text-sm font-medium tracking-wide text-accent uppercase">
            <Link href="/" className="hover:underline">
              Seller Lab 1
            </Link>{' '}
            · Prove it
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">The practice call</h1>
          <p className="max-w-2xl text-stone-600">
            An 8 to 10 minute discovery call with Priya, an AI voice agent playing a buyer. It’s
            scored on what this lab teaches, not on general sales skills. Use headphones.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Briefing />

          <section aria-label="The call" className="space-y-4">
            {access.ready && !access.hasCode && <AccessCodeForm onSave={access.saveCode} />}
            <CallBar
              phase={phase}
              connected={connected}
              agentPresent={agentPresent}
              agentState={agentState}
              slowJoin={slowJoin}
              elapsed={elapsed}
              micOn={micOn}
              onCall={() => void connect()}
              onFinish={() => void finish()}
              onLeave={() => void disconnect()}
              onToggleMic={() => void toggleMic()}
              onCallAgain={() => void callAgain()}
            />

            {(error || notice) && (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {error ?? notice}
              </p>
            )}

            {phase === 'scoring' && (
              <p
                role="status"
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span className="size-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
                Your coach is scoring the call. This takes a few seconds.
              </p>
            )}
            {phase === 'empty' && (
              <p role="status" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
                There’s nothing to score yet: you didn’t say anything to Priya. Call her again when
                you’re ready.
              </p>
            )}
            {phase === 'failed' && (
              <p role="status" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
                The call couldn’t be scored this time. Call Priya again to try once more.
              </p>
            )}
            {phase === 'scored' && scorecard && <ScorecardView card={scorecard} totals={totals} />}

            {(connected || turns.length > 0) && <Transcript turns={turns} live={phase === 'live'} />}

            {connected && phase !== 'scoring' && (
              <TypeBox
                value={typed}
                placeholder={
                  phase === 'live' ? 'Or type what you’d say to Priya' : 'Ask your coach about the scorecard'
                }
                onChange={setTyped}
                onSend={() => void sendTyped()}
              />
            )}
          </section>
        </div>

        {!access.pilot && (
          <footer className="border-t border-stone-200 pt-4 text-xs text-stone-500">
            Calls in this lab aren’t recorded. Each one ends on its own after 15 minutes.
          </footer>
        )}
      </main>
      {room && <RoomAudioRenderer />}
    </RoomContext.Provider>
  );
}

function Briefing() {
  return (
    <aside className="space-y-6 md:sticky md:top-6 md:self-start">
      <section className="space-y-2 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Who you’re calling</h2>
        <p className="text-stone-700">{BRIEF}</p>
        <p className="text-sm text-stone-500">
          She knows much more than this, and shares it only when you ask good questions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How the call works</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          <li>Talk as you would on a real call. No microphone? Type your side instead.</li>
          <li>
            Expect technical questions. “I don’t know, let me bring in our engineer” is a good answer;
            making something up fails the call.
          </li>
          <li>
            When you’re done, press <strong>End the call and get feedback</strong>. A coach scores the
            call and talks you through it.
          </li>
          <li>A pass is {PASS_MARK} of 12 points, with no made-up answers.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What’s scored</h2>
        <p className="text-sm text-stone-500">
          Up to 2 points each. Every point rests on something said in the call.
        </p>
        <ol className="space-y-2 text-sm">
          {RUBRIC.map((item) => (
            <li key={item.id}>
              <span className="font-medium">
                {item.id}. {item.title}.
              </span>{' '}
              <span className="text-stone-700">{item.full}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function CallBar(props: {
  phase: Phase;
  connected: boolean;
  agentPresent: boolean;
  agentState: string;
  slowJoin: boolean;
  elapsed: number;
  micOn: boolean;
  onCall: () => void;
  onFinish: () => void;
  onLeave: () => void;
  onToggleMic: () => void;
  onCallAgain: () => void;
}) {
  const { phase, connected, agentPresent, agentState, slowJoin, elapsed, micOn } = props;
  const live = phase === 'live';
  const over = phase === 'scoring' || phase === 'scored' || phase === 'empty' || phase === 'failed';
  const speaker = over ? 'Your coach' : 'Priya';
  const label =
    phase === 'connecting'
      ? 'Calling…'
      : !connected
        ? over
          ? 'Call ended'
          : 'Not connected'
        : agentPresent
          ? `${speaker} is ${agentState || 'joining'}`
          : slowJoin
            ? 'Waiting for Priya to join. After a quiet spell this can take up to 20 seconds.'
            : 'Waiting for Priya to join…';
  const secondary = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50';
  const primary = 'rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60';

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm" aria-live="polite">
          <span
            className={`size-2.5 rounded-full ${connected && agentPresent ? 'bg-emerald-500' : connected ? 'bg-amber-400' : 'bg-stone-300'}`}
            aria-hidden
          />
          {label}
        </span>
        {(live || over) && (
          <span className="text-sm text-stone-500 tabular-nums">
            <span className="sr-only">Call length </span>
            {clock(elapsed)}
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {connected && (live || phase === 'scored') && (
            <button type="button" onClick={props.onToggleMic} aria-pressed={micOn} className={secondary}>
              {micOn ? 'Mute' : 'Use my microphone'}
            </button>
          )}
          {(phase === 'idle' || phase === 'connecting') && (
            <button type="button" onClick={props.onCall} disabled={phase === 'connecting'} className={primary}>
              Call Priya
            </button>
          )}
          {live && (
            <button type="button" onClick={props.onFinish} disabled={!agentPresent} className={primary}>
              End the call and get feedback
            </button>
          )}
          {(phase === 'scored' || phase === 'empty' || phase === 'failed') && (
            <button type="button" onClick={props.onCallAgain} className={primary}>
              Call Priya again
            </button>
          )}
          {connected && (
            <button type="button" onClick={props.onLeave} className={secondary}>
              {live ? 'Leave without feedback' : 'Leave'}
            </button>
          )}
        </span>
      </div>
      {live && elapsed >= WRAP_UP_AFTER_S && (
        <p className="text-sm text-amber-800">Time to book the next step and wrap up.</p>
      )}
    </div>
  );
}

function ScorecardView({ card, totals }: { card: Scorecard; totals: number[] }) {
  const verdict = card.passed
    ? 'Pass'
    : card.bluff
      ? 'Not a pass: a made-up answer'
      : `Not a pass yet: ${card.passMark} needed`;
  return (
    <section
      aria-labelledby="scorecard-title"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="scorecard-title" className="text-xl font-semibold">
          Your scorecard
        </h2>
        <p className="text-2xl font-semibold tabular-nums">
          {card.total} of {card.max}
        </p>
        <p
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${card.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
        >
          {verdict}
        </p>
      </header>

      <figure className="space-y-1">
        <figcaption className="text-sm font-medium text-stone-500">What your coach said</figcaption>
        <blockquote className="border-l-4 border-accent pl-3 text-stone-800">{card.coach}</blockquote>
      </figure>

      {card.bluff && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          At {card.bluff.time} you said “{card.bluff.quote}” That isn’t true of LiveKit, or isn’t
          something you could know, so the call can’t pass, whatever the total. “I don’t know, let me
          bring in our engineer” would have kept the points.
        </p>
      )}

      <ol className="divide-y divide-stone-100">
        {card.items.map((item) => (
          <li key={item.id} className="flex gap-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">
                {item.id}. {item.title}
              </p>
              {item.quote ? (
                <p className="text-sm text-stone-700">
                  “{item.quote}” <span className="text-stone-400 tabular-nums">{item.time}</span>
                </p>
              ) : (
                <p className="text-sm text-stone-400">Nothing in the call earned points here.</p>
              )}
              {item.improve && (
                <p className="text-sm">
                  <span className="font-medium text-accent">Next time: </span>
                  {item.improve}
                </p>
              )}
            </div>
            <Points score={item.score} />
          </li>
        ))}
      </ol>

      {totals.length > 1 && (
        <p className="text-sm text-stone-500">
          Your calls so far: {totals.join(', ')} of {card.max}.
        </p>
      )}
    </section>
  );
}

function Points({ score }: { score: number }) {
  return (
    <span className="flex shrink-0 gap-1 self-start pt-1.5" role="img" aria-label={`${score} of 2 points`}>
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`size-3 rounded-full ${i < score ? 'bg-accent' : 'border border-stone-300 bg-white'}`}
        />
      ))}
    </span>
  );
}

function Transcript({ turns, live }: { turns: PracticeTurn[]; live: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  const ordered = [...turns].sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns.length]);

  return (
    <section aria-labelledby="transcript-title" className="space-y-2">
      <h2 id="transcript-title" className="text-lg font-semibold">
        Transcript
      </h2>
      {ordered.length === 0 ? (
        <p className="text-sm text-stone-500">
          {live ? 'Say hello. What you and Priya say shows up here.' : 'Nothing was said.'}
        </p>
      ) : (
        <ol
          ref={listRef}
          role="log"
          className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4 text-sm"
        >
          {ordered.map((turn) => {
            const who = turn.role === 'user' ? 'You' : (turn.agent ?? 'Priya');
            const color = who === 'You' ? '' : who === 'Coach' ? 'text-emerald-700' : 'text-accent';
            return (
              <li key={turn.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
                <span className="text-stone-400 tabular-nums">{clock(turn.createdAt - turn.callStartedAt)}</span>
                <p className="leading-snug">
                  <span className={`font-medium ${color}`}>{who}: </span>
                  <span className="text-stone-700">{turn.text || '(nothing heard)'}</span>
                  {turn.interrupted && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">cut off</span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TypeBox(props: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSend();
      }}
    >
      <label htmlFor="typed" className="sr-only">
        Type instead of talking
      </label>
      <input
        id="typed"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        maxLength={MAX_TYPED_CHARS}
        placeholder={props.placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={!props.value.trim()}
        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
