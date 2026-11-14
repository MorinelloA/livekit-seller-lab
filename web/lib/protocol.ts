// Names shared with agent/src/agent.py. Change both together.
export const EVENTS_TOPIC = 'lab.events';
export const RPC_SET_SETTINGS = 'lab.set_settings';
export const RPC_RESET = 'lab.reset';
export const RPC_CUSTOMIZE = 'lab.customize';
export const RPC_GET_STATE = 'lab.get_state';

// Must match MAX_NAME_CHARS and MAX_RULE_CHARS in the agent.
export const MAX_NAME_CHARS = 40;
export const MAX_RULE_CHARS = 200;

// LiveKit Agents publishes the agent's state (listening, thinking, speaking) here.
export const AGENT_STATE_ATTRIBUTE = 'lk.agent.state';

export type Mode = 'baseline' | 'enhanced';
export type Model = 'fast' | 'reasoning';

export interface LabSettings {
  turn_detection: Mode;
  interruptions: Mode;
  /** Experiment 3: "enhanced" runs voice isolation on the caller's audio. */
  noise: Mode;
  /** Experiment 4: which LLM Juniper answers with. */
  model: Model;
}

/** The restaurant Juniper is playing, and the exact instructions its LLM reads. */
export interface LabPersona {
  name: string;
  rule: string;
  custom: boolean;
  instructions: string;
}

/** What every lab RPC returns. */
export interface LabState {
  /** The agent's clock, in Unix seconds, for lining up its speech times with the page's. */
  now?: number;
  settings: LabSettings;
  persona: LabPersona;
}

/** LiveKit's per-turn timing, in seconds. The first two come on caller turns, the next three on agent turns. */
export interface TurnMetrics {
  end_of_turn_delay: number | null;
  transcription_delay: number | null;
  llm_node_ttft: number | null;
  tts_node_ttfb: number | null;
  e2e_latency: number | null;
  /**
   * When the turn's speech started and stopped, in Unix seconds on the agent's
   * clock. Both kinds of turn carry them; an agent from before 15 Nov 2026 doesn't.
   */
  started_speaking_at?: number | null;
  stopped_speaking_at?: number | null;
}

export interface TurnEvent {
  type: 'turn';
  id: string;
  role: 'user' | 'assistant';
  /** The restaurant Juniper was playing when the turn happened. */
  agent?: string;
  text: string;
  interrupted: boolean;
  settings: LabSettings;
  metrics: TurnMetrics;
  createdAt: number;
}

export interface FalseInterruptionEvent {
  type: 'false_interruption';
  resumed: boolean;
  settings: LabSettings;
  createdAt: number;
}

/** The session hit its time limit; the agent says goodbye and closes the room. */
export interface TimeLimitEvent {
  type: 'time_limit';
  minutes: number;
}

export type LabEvent = TurnEvent | FalseInterruptionEvent | TimeLimitEvent;

/** A lab event as the page keeps it, tagged with the test-caller run it arrived during. */
export type LoggedEvent = LabEvent & { runId: string | null; receivedAt: number };

export type LoggedTurn = TurnEvent & { runId: string | null; receivedAt: number };

export function isTurn(event: LoggedEvent): event is LoggedTurn {
  return event.type === 'turn';
}
