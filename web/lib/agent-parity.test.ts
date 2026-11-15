// The agent is Python and the pages are TypeScript, so the names they share
// are written twice. These tests read the Python source as text and fail when
// the two copies differ, naming both files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CHAT_TOPIC, PASS_MARK, RPC_FINISH, RUBRIC, SCORECARD_TOPIC } from './practice.ts';
import {
  EVENTS_TOPIC,
  MAX_NAME_CHARS,
  MAX_RULE_CHARS,
  RPC_CUSTOMIZE,
  RPC_GET_STATE,
  RPC_RESET,
  RPC_SET_SETTINGS,
} from './protocol.ts';

const AGENT = path.join(import.meta.dirname, '..', '..', 'agent', 'src');
const python = (file: string) => fs.readFileSync(path.join(AGENT, file), 'utf8').replace(/\r\n/g, '\n');
const agent = python('agent.py');
const common = python('common.py');
const prospect = python('prospect.py');

/** A module-level constant written `NAME = "text"` in Python. */
function pyString(source: string, name: string): string {
  const match = source.match(new RegExp(`^${name} = "([^"]*)"$`, 'm'));
  assert.ok(match, `no ${name} = "…" in the Python source`);
  return match[1];
}

/** A module-level constant written `NAME = 12` in Python. */
function pyNumber(source: string, name: string): number {
  const match = source.match(new RegExp(`^${name} = ([0-9.]+)$`, 'm'));
  assert.ok(match, `no ${name} = <number> in the Python source`);
  return Number(match[1]);
}

/** Curly quotes are for the page; the Python source types them straight. */
const plain = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

test('the lab’s RPCs have the same names in agent.py and protocol.ts', () => {
  const pairs = { RPC_SET_SETTINGS, RPC_RESET, RPC_CUSTOMIZE, RPC_GET_STATE };
  for (const [name, value] of Object.entries(pairs)) {
    assert.equal(pyString(agent, name), value, `${name} differs between agent/src/agent.py and web/lib/protocol.ts`);
    assert.ok(agent.includes(`register_rpc_method(${name},`), `agent.py never registers ${name}`);
  }
});

test('the limits on a renamed restaurant match', () => {
  assert.equal(pyNumber(agent, 'MAX_NAME_CHARS'), MAX_NAME_CHARS, 'MAX_NAME_CHARS: agent.py against protocol.ts');
  assert.equal(pyNumber(agent, 'MAX_RULE_CHARS'), MAX_RULE_CHARS, 'MAX_RULE_CHARS: agent.py against protocol.ts');
});

test('the page listens where the agent sends', () => {
  assert.equal(pyString(common, 'EVENTS_TOPIC'), EVENTS_TOPIC, 'EVENTS_TOPIC: agent/src/common.py against web/lib/protocol.ts');
  assert.equal(pyString(prospect, 'SCORECARD_TOPIC'), SCORECARD_TOPIC, 'SCORECARD_TOPIC: prospect.py against practice.ts');
  assert.equal(pyString(prospect, 'RPC_FINISH'), RPC_FINISH, 'RPC_FINISH: prospect.py against practice.ts');
  assert.ok(prospect.includes('register_rpc_method(RPC_FINISH,'), 'prospect.py never registers RPC_FINISH');
  // Typed turns: LiveKit Agents reads this topic itself, so the agent never names it.
  assert.equal(CHAT_TOPIC, 'lk.chat');
});

test('every timing the page reads is one the agent sends', () => {
  const block = common.match(/^METRIC_KEYS = \(([^)]*)\)/m);
  assert.ok(block, 'no METRIC_KEYS tuple in common.py');
  const sent = [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const protocol = fs.readFileSync(path.join(import.meta.dirname, 'protocol.ts'), 'utf8');
  const metrics = protocol.match(/export interface TurnMetrics \{([\s\S]*?)\n\}/);
  assert.ok(metrics, 'no TurnMetrics interface in protocol.ts');
  const read = [...metrics[1].matchAll(/^\s+([a-z_]+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual([...read].sort(), [...sent].sort(), 'TurnMetrics in protocol.ts against METRIC_KEYS in common.py');
});

test('the scoring rubric is the same six items, in the same order', () => {
  const block = prospect.match(/^RUBRIC: list\[dict\[str, Any\]\] = \[([\s\S]*?)^\]/m);
  assert.ok(block, 'no RUBRIC list in prospect.py');
  const items = [...block[1].matchAll(/"id": (\d+),\s*"title": "([^"]*)"/g)].map((m) => ({ id: Number(m[1]), title: m[2] }));
  assert.equal(items.length, 6);
  assert.deepEqual(
    items,
    RUBRIC.map((item) => ({ id: item.id, title: plain(item.title) })),
    'RUBRIC: agent/src/prospect.py against web/lib/practice.ts',
  );
  assert.equal(pyNumber(prospect, 'PASS_MARK'), PASS_MARK, 'PASS_MARK: prospect.py against practice.ts');
  const honesty = pyNumber(prospect, 'HONESTY_ITEM');
  assert.equal(RUBRIC.find((item) => item.id === honesty)?.title, 'Technical honesty');
});

test('the page waits longer for a score than the judge can take', () => {
  const page = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'PracticeCall.tsx'), 'utf8');
  const wait = page.match(/const SCORING_TIMEOUT_MS = ([0-9_]+);/);
  assert.ok(wait, 'no SCORING_TIMEOUT_MS in PracticeCall.tsx');
  const waitSeconds = Number(wait[1].replaceAll('_', '')) / 1000;
  const tries = 2; // max_retry=1 in prospect.py's judge()
  assert.ok(prospect.includes('max_retry=1'), 'the judge’s retry count changed; update this test');
  assert.ok(
    waitSeconds > pyNumber(prospect, 'JUDGE_TIMEOUT_SECONDS') * tries,
    'PracticeCall.tsx gives up before prospect.py’s judge has had both tries',
  );
});
