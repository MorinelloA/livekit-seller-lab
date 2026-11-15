'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { type RemoteParticipant, type Room, RoomEvent } from 'livekit-client';
import { AccessCodeForm } from '@/components/AccessCodeForm';
import { AgentBars } from '@/components/AgentBars';
import { PilotBanner } from '@/components/PilotBanner';
import { Callout, Eyebrow, Pill, Points } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { WrappingInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
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
import { createRoom } from '@/lib/room';
import { asSentence } from '@/lib/text';
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
// The coach scores a call in a few seconds; after this long, stop waiting and say so.
const SCORING_TIMEOUT_MS = 60_000;
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
  // A turned-down access code's reason, shown under the code's field rather than in the call bar.
  const [codeError, setCodeError] = useState<string | null>(null);
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

      const r = createRoom();
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
        // Only this call's own room ends it: a late event from the last call's room is ignored.
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current === r) void disconnect();
        });

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
      if (err instanceof AccessCodeError) {
        rejectCode();
        setCodeError(message(err));
      } else {
        setError(message(err));
      }
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

  // If the scorecard never comes (the agent stopped, say), "scoring" shouldn't stay up for good.
  useEffect(() => {
    if (phase !== 'scoring') return;
    const timer = setTimeout(() => {
      setPhase((p) => (p === 'scoring' ? 'failed' : p));
      logPilot({ kind: 'notice', page: 'practice', text: 'The call couldn’t be scored: no scorecard within a minute.' });
    }, SCORING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <RoomContext.Provider value={room ?? undefined}>
      <main id="main" className="page-column">
        {access.pilot && (
          <div className="pt-6">
            <PilotBanner pilot={access.pilot} page="practice" />
          </div>
        )}
        <header className="flex flex-col gap-[18px] pt-14 pb-10 sm:pt-16">
          <Eyebrow>Seller Lab 1 · Prove it</Eyebrow>
          <h1 className="display text-page-title leading-page">The practice call</h1>
          <p className="max-w-[680px] text-lead leading-reading tracking-body">
            An 8 to 10 minute discovery call with Priya, an AI voice agent playing a buyer. It’s scored on what this lab
            teaches, not on general sales skills. Use headphones.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Briefing />

          {/* Below 1024px the call comes first on screen, so Call Priya isn't a page below the
              briefing; the briefing stays first for screen readers and the keyboard. */}
          <section aria-label="The call" className="flex min-w-0 flex-col gap-4 max-lg:order-first">
            {access.ready && !access.hasCode && (
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
            )}
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

            {(error || notice) && <Callout>{error ?? notice}</Callout>}

            {phase === 'scoring' && (
              <p role="status" className="m-0 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg">
                <span className="size-2.5 animate-pulse rounded-full bg-ok" aria-hidden />
                Your coach is scoring the call. This takes a few seconds.
              </p>
            )}
            {phase === 'empty' && (
              <Callout tone="info">
                There’s nothing to score yet: you didn’t say anything to Priya. Call her again when you’re ready.
              </Callout>
            )}
            {phase === 'failed' && (
              <Callout tone="info">The call couldn’t be scored this time. Call Priya again to try once more.</Callout>
            )}
            {phase === 'scored' && scorecard && <ScorecardView card={scorecard} totals={totals} />}

            {(connected || turns.length > 0) && <Transcript turns={turns} live={phase === 'live'} />}

            {connected && phase !== 'scoring' && (
              <TypeBox
                value={typed}
                placeholder={phase === 'live' ? 'Or type what you’d say to Priya' : 'Ask your coach about the scorecard'}
                onChange={setTyped}
                onSend={() => void sendTyped()}
              />
            )}
          </section>
        </div>

        {!access.pilot && (
          <p className="mt-10 mb-0 text-xs text-subtle">Calls in this lab aren’t recorded. Each one ends on its own after 15 minutes.</p>
        )}
      </main>
      {room && <RoomAudioRenderer />}
    </RoomContext.Provider>
  );
}

/** Priya's details split out of the brief, for a quick read before the call. */
function Briefing() {
  return (
    // Sticky only where the screen is tall enough to show all of it (about 1,000px of it).
    <aside aria-label="Briefing" className="flex flex-col gap-7 lg:self-start lg:tall:sticky lg:tall:top-6">
      <section aria-labelledby="who-title" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <Eyebrow as="h2" id="who-title" size="sm">
          Who you’re calling
        </Eyebrow>
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-accent-line bg-raised font-mono text-card font-bold text-fg"
          >
            PR
          </span>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-fg">Priya Raman</span>
            <span className="text-sm">CTO and co-founder, Fluento</span>
          </div>
        </div>
        <dl className="m-0 flex flex-col gap-3">
          {BRIEF.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1">
              <Eyebrow as="dt" size="sm">
                {fact.label}
              </Eyebrow>
              <dd className="m-0 text-sm leading-relaxed text-fg">{fact.text}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 border-t border-line pt-3.5 text-small leading-relaxed text-subtle">
          She knows much more than this, and shares it only when you ask good questions.
        </p>
      </section>

      <section aria-labelledby="how-title" className="flex flex-col gap-3">
        <h2 id="how-title" className="m-0 text-lg font-medium text-fg">
          How the call works
        </h2>
        <ul className="m-0 flex list-disc flex-col gap-2 pl-[18px] text-sm leading-relaxed">
          <li>Talk as you would on a real call. No microphone? Type your side instead.</li>
          <li>
            Expect technical questions. “I don’t know, let me bring in our engineer” is a good answer; making something up
            fails the call.
          </li>
          <li>
            When you’re done, press <strong className="font-semibold text-fg">End the call and get feedback</strong>. A
            coach scores the call and talks you through it.
          </li>
          <li>A pass is {PASS_MARK} of 12 points, with no made-up answers.</li>
        </ul>
      </section>

      <section aria-labelledby="rubric-title" className="flex flex-col gap-3">
        <h2 id="rubric-title" className="m-0 text-lg font-medium text-fg">
          What’s scored
        </h2>
        <p className="m-0 text-small leading-relaxed text-subtle">Up to 2 points each. Every point rests on something said in the call.</p>
        <ol className="m-0 flex list-none flex-col border-t border-line p-0">
          {RUBRIC.map((item) => (
            <li key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 border-b border-line py-3 text-sm leading-relaxed">
              <span className="font-mono text-subtle">{item.id}</span>
              <span>
                <span className="font-semibold text-fg">{item.title}. </span>
                {item.full}
              </span>
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

  // When Call becomes End, or End becomes Call again, the button that had focus is gone. Rather
  // than let focus fall to the page, it moves to the call's status.
  const labelRef = useRef<HTMLSpanElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (document.activeElement === document.body) labelRef.current?.focus();
  }, [phase]);
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
  // What a screen reader hears: joins, leaves and waits, not every listening, thinking and
  // speaking change (the visible label still shows those).
  const announce =
    phase === 'connecting'
      ? 'Calling Priya.'
      : !connected
        ? ''
        : !agentPresent
          ? slowJoin
            ? label
            : 'Waiting for Priya to join.'
          : over
            ? 'The call is over. Your coach is on the line.'
            : 'Priya joined the call.';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface py-3 pr-3 pl-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {connected && agentPresent ? (
            <AgentBars tone={over ? 'ok' : 'accent'} />
          ) : (
            <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', connected ? 'animate-pulse bg-warn' : 'bg-subtle')} />
          )}
          <div className="flex min-w-0 flex-col">
            <span ref={labelRef} tabIndex={-1} className="text-sm font-semibold text-fg focus:outline-none">
              {label}
            </span>
            <span className="sr-only" aria-live="polite">
              {announce}
            </span>
            {(live || over) && (
              <span className="font-mono text-label text-subtle tabular-nums">
                <span className="sr-only">Call length </span>
                {over ? `Call ended · ${clock(elapsed)}` : clock(elapsed)}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {connected && (live || phase === 'scored') && (
            <Button onClick={props.onToggleMic}>
              <Icon name="mic" className="size-4" />
              {micOn ? 'Mute' : 'Use my microphone'}
            </Button>
          )}
          {(phase === 'idle' || phase === 'connecting') && (
            <Button id="call-button" variant="primary" onClick={props.onCall} disabled={phase === 'connecting'}>
              <Icon name="phone" className="size-4" />
              Call Priya
            </Button>
          )}
          {live && (
            <Button variant="primary" onClick={props.onFinish} disabled={!agentPresent}>
              End the call and get feedback
            </Button>
          )}
          {(phase === 'scored' || phase === 'empty' || phase === 'failed') && (
            <Button variant="primary" onClick={props.onCallAgain}>
              Call Priya again
            </Button>
          )}
          {connected && (
            <Button variant={live ? 'danger' : 'secondary'} onClick={props.onLeave}>
              {live ? 'Leave without feedback' : 'Leave'}
            </Button>
          )}
        </div>
      </div>
      {live && elapsed >= WRAP_UP_AFTER_S && <p className="m-0 text-sm text-warn">Time to book the next step and wrap up.</p>}
    </div>
  );
}

function ScorecardView({ card, totals }: { card: Scorecard; totals: number[] }) {
  const verdict = card.passed ? 'Pass' : card.bluff ? 'Not a pass: a made-up answer' : `Not a pass yet: ${card.passMark} needed`;
  // When a scorecard arrives, focus moves to it, so a screen reader reads its name
  // ("Your scorecard: 12 of 12. Pass") and a keyboard user starts from it.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [card]);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="scorecard-title"
      className="rounded-lg border border-line bg-surface focus:outline-none"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line px-6 pt-6 pb-5">
        <div className="flex flex-col gap-2">
          <Eyebrow as="span" size="sm">
            Your scorecard
          </Eyebrow>
          <h2 id="scorecard-title" className="m-0 flex items-baseline gap-3 text-fg">
            <span className="sr-only">Your scorecard: </span>
            <span className="display text-score leading-none tracking-score tabular-nums">{card.total}</span>
            <span className="text-title font-light text-subtle">of {card.max}</span>
            <span className="sr-only">. {verdict}</span>
          </h2>
        </div>
        <span
          className={cx(
            'inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-sm font-semibold',
            card.passed ? 'border-ok/40 bg-ok-soft text-ok' : 'border-bad-line bg-bad-soft text-bad',
          )}
        >
          <Icon name={card.passed ? 'check' : 'x'} className="size-3.5" strokeWidth={1.8} />
          {verdict}
        </span>
      </header>

      <figure className="m-0 flex flex-col gap-2.5 border-b border-line px-6 py-5">
        <figcaption className="eyebrow-sm text-ok">What your coach said</figcaption>
        <blockquote className="display m-0 text-xl leading-normal">{card.coach}</blockquote>
      </figure>

      {card.bluff && (
        <Callout tone="bad" role="note" className="mx-6 mt-5">
          At <span className="font-mono">{card.bluff.time}</span> you said “{asSentence(card.bluff.quote)}” That isn’t true of LiveKit,
          or isn’t something you could know, so the call can’t pass, whatever the total. “I don’t know, let me bring in our
          engineer” would have kept the points.
        </Callout>
      )}

      <ol className="m-0 list-none px-6 py-2">
        {card.items.map((item, i) => (
          <li key={item.id} className={cx('flex gap-4 py-3.5', i > 0 && 'border-t border-line')}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="m-0 text-card font-semibold text-fg">
                {item.id}. {item.title}
              </p>
              {item.quote ? (
                <p className="m-0 text-sm leading-relaxed">
                  “{item.quote}” <span className="font-mono text-xs text-subtle tabular-nums">{item.time}</span>
                </p>
              ) : (
                <p className="m-0 text-sm text-subtle">Nothing in the call earned points here.</p>
              )}
              {item.improve && (
                <p className="m-0 text-sm leading-relaxed">
                  <span className="font-semibold text-accent">Next time: </span>
                  {item.improve}
                </p>
              )}
            </div>
            <Points score={item.score} />
          </li>
        ))}
      </ol>

      {totals.length > 1 && (
        <p className="m-0 flex flex-wrap items-center gap-2 border-t border-line px-6 py-4 text-sm text-subtle">
          Your calls so far:
          {totals.map((total, i) => (
            <Pill key={i} tone={i === totals.length - 1 ? 'accent' : 'neutral'}>
              {total} of {card.max}
            </Pill>
          ))}
        </p>
      )}
    </section>
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
    <section aria-labelledby="transcript-title" className="flex flex-col gap-2.5">
      <h2 id="transcript-title" className="m-0 text-lg font-medium text-fg">
        Transcript
      </h2>
      {ordered.length === 0 ? (
        <p className="m-0 text-sm text-subtle">{live ? 'Say hello. What you and Priya say shows up here.' : 'Nothing was said.'}</p>
      ) : (
        <ol
          ref={listRef}
          // It scrolls once a call has a few turns, so it can be reached and scrolled by keyboard.
          tabIndex={0}
          aria-label="Transcript"
          className="m-0 flex max-h-96 list-none flex-col gap-2.5 overflow-y-auto rounded-lg border border-line bg-surface px-[18px] py-4 text-sm"
        >
          {ordered.map((turn) => {
            const who = turn.role === 'user' ? 'You' : (turn.agent ?? 'Priya');
            const color = who === 'You' ? 'text-fg' : who === 'Coach' ? 'text-ok' : 'text-accent';
            return (
              <li key={turn.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
                <span className="font-mono text-xs leading-[21px] text-subtle tabular-nums">{clock(turn.createdAt - turn.callStartedAt)}</span>
                <p className="m-0 leading-relaxed">
                  <span className={cx('font-semibold', color)}>{who}: </span>
                  {turn.text || '(nothing heard)'}
                  {turn.interrupted && (
                    <span className="ml-1.5 rounded-sm bg-warn-soft px-1.5 font-mono text-label text-warn">cut off</span>
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

function TypeBox(props: { value: string; placeholder: string; onChange: (value: string) => void; onSend: () => void }) {
  return (
    // On a phone, Send goes under the field, so the field (and its placeholder) gets the width.
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSend();
      }}
    >
      <label htmlFor="typed" className="sr-only">
        Type instead of talking
      </label>
      {/* Wraps, so a long message (or the placeholder on a phone) stays readable; Enter sends. */}
      <WrappingInput
        id="typed"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.form?.requestSubmit();
        }}
        maxLength={MAX_TYPED_CHARS}
        placeholder={props.placeholder}
        autoComplete="off"
        className="flex-1"
      />
      <Button type="submit" disabled={!props.value.trim()}>
        Send
      </Button>
    </form>
  );
}
