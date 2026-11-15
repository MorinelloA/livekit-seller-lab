'use client';

import { AgentBars } from '@/components/AgentBars';
import { Callout } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import type { LabSettings } from '@/lib/protocol';

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** The four switches, as the dock shows them. The LiveKit setting is in the accent. */
function chips(settings: LabSettings) {
  return [
    { name: 'Turns', value: settings.turn_detection === 'enhanced' ? 'Enhanced' : 'Baseline', on: settings.turn_detection === 'enhanced' },
    { name: 'Interruptions', value: settings.interruptions === 'enhanced' ? 'Enhanced' : 'Baseline', on: settings.interruptions === 'enhanced' },
    { name: 'Noise', value: settings.noise === 'enhanced' ? 'Isolated' : 'Raw', on: settings.noise === 'enhanced' },
    { name: 'Model', value: settings.model === 'reasoning' ? 'Reasoning' : 'Fast', on: false },
  ];
}

/**
 * The lab's call controls, pinned to the bottom of the screen: the call is the
 * one thing every section depends on. Messages appear here too, so they're
 * seen wherever the learner has scrolled to.
 */
export function CallDock(props: {
  status: CallStatus;
  hasRoom: boolean;
  agentPresent: boolean;
  agentState: string;
  slowJoin: boolean;
  settings: LabSettings;
  persona: string | null;
  micOn: boolean;
  busy: boolean;
  message: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMic: () => void;
}) {
  const { status, agentPresent, agentState, slowJoin, settings, micOn, busy, message } = props;
  const connected = status === 'connected';
  const label = !connected
    ? status === 'connecting'
      ? 'Calling Juniper…'
      : 'Not connected'
    : agentPresent
      ? `Juniper is ${agentState || 'joining'}`
      : slowJoin
        ? 'Waiting for Juniper. After a quiet spell this can take up to 20 seconds.'
        : 'Waiting for Juniper to join…';

  return (
    <div className="sticky bottom-3 z-30 mt-10 flex flex-col gap-2 sm:bottom-4">
      {message && <Callout className="[box-shadow:var(--dock-shadow)] backdrop-blur-md">{message}</Callout>}
      <section
        aria-label="Call"
        // One row on phones, as the kit draws the dock at 390px: the status takes what the
        // buttons leave. From 640px the settings chips can wrap onto a second row.
        className="flex items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-dock py-3 pr-3 pl-4 [box-shadow:var(--dock-shadow)] backdrop-blur-md max-sm:gap-x-3 sm:flex-wrap"
      >
        <div className="flex min-w-0 items-center gap-3 max-sm:flex-1">
          {props.hasRoom && agentPresent ? (
            <AgentBars />
          ) : (
            <span
              aria-hidden
              className={cx('size-2.5 shrink-0 rounded-full', connected ? 'animate-pulse bg-warn' : 'bg-subtle')}
            />
          )}
          <div className="flex min-w-0 flex-col" aria-live="polite">
            <span className="text-sm font-semibold text-fg">{label}</span>
            {connected && props.persona && (
              <span className="truncate font-mono text-label text-subtle" title={props.persona}>
                {props.persona}
              </span>
            )}
          </div>
        </div>
        {connected && (
          <ul aria-label="Settings in use" className="m-0 hidden list-none flex-wrap gap-1.5 p-0 md:flex">
            {chips(settings).map((chip) => (
              <li
                key={chip.name}
                className="inline-flex min-h-6.5 items-center gap-1.5 rounded border border-line px-2 font-mono text-label tracking-chip text-subtle uppercase"
              >
                {chip.name}
                <span className={cx('normal-case', chip.on ? 'text-accent' : 'text-fg')}>{chip.value}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          {connected && (
            <Button
              onClick={props.onToggleMic}
              disabled={busy}
              aria-pressed={micOn}
              className={micOn ? 'border-accent-line bg-accent-soft text-accent' : undefined}
            >
              <Icon name="mic" className="size-4" />
              {/* Icon-only on phones, as the kit draws the dock at 390px; the name stays for screen readers. */}
              <span className="max-sm:sr-only">{micOn ? 'Your microphone is on' : 'Use my voice'}</span>
            </Button>
          )}
          {connected ? (
            <Button variant="danger" onClick={props.onDisconnect}>
              Leave
            </Button>
          ) : (
            <Button variant="primary" onClick={props.onConnect} disabled={status === 'connecting'}>
              <Icon name="phone" className="size-4" />
              Call Juniper
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
