import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RpcError } from 'livekit-client';
import { problem } from './problems.ts';

// The translated errors also go to the console, for whoever is debugging.
console.warn = () => undefined;

test('the lab’s own sentences pass through', () => {
  assert.equal(problem(new Error('The lab has reached its limit of calls for today.')), 'The lab has reached its limit of calls for today.');
});

test('a failed connection is said in plain words, without the library’s', () => {
  // livekit-client's ConnectionError: its constructor is protected, its name is what the page sees.
  const error = Object.assign(new Error('could not establish pc connection'), { name: 'ConnectionError' });
  const said = problem(error);
  assert.match(said, /couldn’t connect/);
  assert.doesNotMatch(said, /pc connection/);
});

test('an RPC that times out names the agent', () => {
  const error = RpcError.builtIn('RESPONSE_TIMEOUT');
  assert.equal(problem(error, 'Priya'), 'Priya didn’t answer in time. Try that again.');
});

test('an RPC to an agent that has gone says to call again', () => {
  assert.match(problem(RpcError.builtIn('RECIPIENT_DISCONNECTED')), /Juniper has left the call/);
});

test('an agent’s own RPC error doesn’t show its internals', () => {
  const said = problem(new RpcError(1500, 'Application error in method handler'));
  assert.doesNotMatch(said, /handler/);
});

test('a blocked microphone says what to do', () => {
  const error = new DOMException('Permission denied', 'NotAllowedError');
  assert.match(problem(error), /blocked the microphone/);
});

test('an unreachable server is a sentence, not “Failed to fetch”', () => {
  assert.match(problem(new TypeError('Failed to fetch')), /couldn’t be reached/);
});
