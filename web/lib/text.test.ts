// Run with `pnpm test` (node --test; Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { oneLine, splitBrand } from './text.ts';

test('a one-line field turns typed or pasted line breaks into single spaces', () => {
  assert.equal(oneLine('Mention the special\nbefore booking'), 'Mention the special before booking');
  assert.equal(oneLine('Ask about allergies.  \r\n\r\n  Offer the patio.'), 'Ask about allergies. Offer the patio.');
  assert.equal(oneLine('No breaks here'), 'No breaks here');
});

test('the brand name is split out of a label, so it can keep its case in capitals', () => {
  assert.deepEqual(splitBrand('A hands-on lab for new LiveKit sellers'), ['A hands-on lab for new ', 'LiveKit', ' sellers']);
  assert.deepEqual(splitBrand('LiveKit’s per-turn metrics'), ['', 'LiveKit', '’s per-turn metrics']);
  assert.deepEqual(splitBrand('Enhanced'), ['Enhanced']);
});
