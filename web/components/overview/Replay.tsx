'use client';

import { useMemo, useState } from 'react';
import { ConversationTimeline, type TimelineRun, TimelineLegend } from '@/components/ConversationTimeline';
import { TurnList } from '@/components/TurnList';
import { brandCase, Callout, Eyebrow, Segmented } from '@/components/ui/Bits';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import type { ExperimentId } from '@/lib/experiments';
import { withBase } from '@/lib/paths';
import type { Peaks } from '@/lib/peaks';
import { isTurn, type Mode } from '@/lib/protocol';
import { loadRecording, type Recording } from '@/lib/recordings';
import { playheadMs, recordedTimeline, recordingName } from '@/lib/replay';
import { type ClipKey, TIMELINE_SECONDS } from '@/lib/timeline';
import { usePlaybackPosition, useRecordingPlayer } from '@/lib/useRecordingPlayer';

/** One setting's take, as the server read it from the recording. */
export interface ReplaySetting {
  mode: Mode;
  /** "Baseline", or "Fast model" in Experiment 4. */
  name: string;
  /** The lane's label: the name, and what the setting does. */
  label: string;
  /** What the take showed, from lib/runSummary.ts. */
  summary: string;
  /** How long the recording plays, in ms; null when the take has no sound. */
  durationMs: number | null;
}

export interface ReplayExperiment {
  id: ExperimentId;
  switchName: string;
  /** The day the takes were recorded, written out. */
  recordedOn: string;
  /** What the sound can't show, when there's something a listener should know. */
  note?: string;
  settings: ReplaySetting[];
}

const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

/**
 * The overview's hero: two real test-caller runs of one experiment on one time
 * axis, with the recording of either. The playhead follows the sound. Only the
 * first experiment's runs come with the page; another's load when it's picked.
 */
export function Replay({ experiments, first }: { experiments: ReplayExperiment[]; first: Recording }) {
  const [picked, setPicked] = useState<ExperimentId>(experiments[0].id);
  const [mode, setMode] = useState<Mode>('baseline');
  const [loaded, setLoaded] = useState<Partial<Record<ExperimentId, Recording>>>({ [experiments[0].id]: first });
  // The experiment whose runs didn't load, so only its own view says so.
  const [failed, setFailed] = useState<ExperimentId | null>(null);
  const player = useRecordingPlayer();

  const experiment = experiments.find((e) => e.id === picked) ?? experiments[0];
  const setting = experiment.settings.find((s) => s.mode === mode) ?? experiment.settings[0];
  const recording = loaded[experiment.id];
  const key = recordingName(experiment.id, setting.mode);
  const held = player.key === key;
  const status = held ? player.status : 'idle';
  const going = status === 'loading' || status === 'playing' || status === 'buffering';
  const position = usePlaybackPosition(key);
  const dataFailed = failed === experiment.id && !recording;
  const soundFailed = held && player.problem === 'failed';
  const blocked = held && player.problem === 'blocked';

  const fetchRuns = (id: ExperimentId) => {
    setFailed(null);
    loadRecording(id).then(
      (runs) => setLoaded((prev) => ({ ...prev, [id]: runs })),
      () => setFailed(id),
    );
  };

  const pick = (id: ExperimentId) => {
    player.stop();
    setPicked(id);
    setMode('baseline');
    if (!loaded[id]) fetchRuns(id);
  };

  const toggle = () => {
    if (status === 'paused') player.resume();
    else if (going) player.pause();
    else {
      // The sound starts inside the click, as browsers require. Runs that failed to load are asked for again.
      player.play(key, withBase(`/replay/${key}.wav`));
      if (dataFailed) fetchRuns(experiment.id);
    }
  };

  const figure = useMemo(() => {
    if (!recording) return null;
    const runs: TimelineRun[] = experiment.settings.map((s) => ({
      key: s.mode,
      label: s.label,
      tone: s.mode,
      timeline: recordedTimeline(recording[s.mode]),
      events: recording[s.mode].events,
    }));
    const peaks: Partial<Record<ClipKey, Peaks>> = Object.assign({}, ...experiment.settings.map((s) => recording[s.mode].peaks));
    return { runs, peaks };
  }, [experiment, recording]);

  const announcement = blocked
    ? 'Your browser didn’t start the sound. Press Play again.'
    : !recording && !dataFailed
      ? `Loading Experiment ${experiment.id}’s recording.`
      : status === 'loading'
        ? `Loading the ${setting.name} call.`
        : status === 'buffering'
          ? 'The recording is buffering.'
          : status === 'ended'
            ? `The ${setting.name} call has finished.`
            : '';

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <Eyebrow size="sm">{`Experiment ${experiment.id} · ${experiment.switchName}`}</Eyebrow>
          <h2 id="replay-title" className="m-0 text-title leading-snug font-normal tracking-title text-fg">
            Same caller, two settings
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {experiments.length > 1 && (
            <Segmented
              label="Which experiment"
              options={experiments.map((e) => ({ value: String(e.id), label: e.switchName }))}
              value={String(experiment.id)}
              onChange={(id) => pick(Number(id) as ExperimentId)}
            />
          )}
          <Segmented
            label="Which run to hear"
            options={experiment.settings.map((s) => ({ value: s.mode, label: s.name }))}
            value={setting.mode}
            onChange={(next) => {
              player.stop();
              setMode(next);
            }}
          />
          <Button onClick={toggle} disabled={setting.durationMs === null}>
            <Icon name={going ? 'pause' : 'play'} className="size-3" />
            {going ? 'Pause' : status === 'paused' ? 'Resume' : `Play the ${setting.name} call`}
          </Button>
          {/* Where the sound is, out of its length. While it loads, the same place says so. */}
          <span className="min-w-[17ch] font-mono text-small text-subtle tabular-nums" aria-hidden>
            {status === 'loading'
              ? 'Loading…'
              : status === 'buffering'
                ? 'Buffering…'
                : `${clock(position ?? 0)} / ${clock(setting.durationMs ?? 0)}`}
          </span>
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>

      {blocked && <p className="m-0 px-5 pt-4 text-small text-warn sm:px-6">Your browser didn’t start the sound. Press Play again.</p>}
      {(dataFailed || soundFailed) && (
        <div className="px-4 pt-5 sm:px-6">
          <Callout>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 flex-[1_1_16rem]">
                {dataFailed
                  ? `Experiment ${experiment.id}’s recording didn’t load.`
                  : `The sound of the ${setting.name} call didn’t load.`}{' '}
                Check your connection, then try again.
              </span>
              <Button size="sm" onClick={() => (dataFailed ? fetchRuns(experiment.id) : toggle())}>
                Retry
              </Button>
            </div>
          </Callout>
        </div>
      )}

      <div className="px-4 pt-6 pb-2 sm:px-6">
        {figure && recording ? (
          <ConversationTimeline
            key={experiment.id}
            runs={figure.runs.map((run) => (status === 'playing' && run.key === setting.mode ? { ...run, label: `${run.label} · playing` } : run))}
            minSeconds={TIMELINE_SECONDS[experiment.id]}
            peaks={figure.peaks}
            showOverlap={experiment.id === 1}
            playheadMs={position !== null ? playheadMs(recording[setting.mode], position) : null}
            callerFrom={setting.mode}
            title={`Experiment ${experiment.id}, recorded: the same test caller on both settings`}
          />
        ) : (
          // About the figure's height, so the page doesn't jump when the runs arrive.
          <p className="m-0 flex min-h-[302px] items-center justify-center text-small text-subtle">
            {dataFailed ? 'The figure needs the recording’s runs.' : 'Loading the recording…'}
          </p>
        )}
      </div>
      <div className="px-4 pt-2 pb-5 sm:px-6">
        <TimelineLegend overlap={experiment.id === 1} stalls={experiment.id === 2} />
      </div>

      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        {experiment.settings.map((s) => (
          <div key={s.mode} className="flex flex-col gap-1.5 bg-surface px-5 py-5 sm:px-6">
            <p className={cx('eyebrow-sm m-0', s.mode === 'enhanced' ? 'text-accent' : 'text-subtle')}>{brandCase(s.label)}</p>
            <p className="m-0 text-card leading-relaxed text-body">{s.summary}</p>
          </div>
        ))}
      </div>

      {/* The sound's text alternative: every turn of the run being heard, as the agent reported it. */}
      {recording && (
        <details className="group border-t border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-sm font-semibold text-fg sm:px-6 [&::-webkit-details-marker]:hidden">
            <Icon name="arrow" className="size-3.5 text-subtle transition-transform group-open:rotate-90" />
            Read the {setting.name} call
          </summary>
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <TurnList turns={recording[setting.mode].events.filter(isTurn)} markExtra={experiment.id === 3} />
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-2.5 sm:px-6">
        <p className="m-0 max-w-[760px] py-1 font-mono text-xs leading-relaxed text-subtle">
          Recorded on {experiment.recordedOn}: a real call in a LiveKit Cloud room, with the lab’s agent and models. You
          hear what the caller heard, the test clip and Juniper’s voice.{experiment.note ? ` ${experiment.note}` : ''}
        </p>
        <ButtonLink href={`/lab/#experiment-${experiment.id}`} variant="quiet">
          Open Experiment {experiment.id} in the lab
          <Icon name="arrow" className="size-3.5" strokeWidth={1.8} />
        </ButtonLink>
      </div>
    </div>
  );
}
