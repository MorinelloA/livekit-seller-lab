// A seller repeats what a card says to a customer, so every product fact on a
// card has to point at the LiveKit page it came from.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPERIMENTS, FACTS_CHECKED_ON } from './experiments.ts';

const ALLOWED_HOSTS = ['docs.livekit.io', 'livekit.com'];

test('every seller card names at least one source, on LiveKit’s own sites', () => {
  for (const experiment of EXPERIMENTS) {
    const { sources } = experiment.card;
    assert.ok(sources.length > 0, `Experiment ${experiment.id}’s card has no source`);
    for (const source of sources) {
      const url = new URL(source.href);
      assert.equal(url.protocol, 'https:', source.href);
      assert.ok(ALLOWED_HOSTS.includes(url.hostname), `${source.href} isn’t a LiveKit page`);
      assert.equal(url.search, '', `${source.href} carries a query string`);
      assert.ok(source.label.trim(), `a source of Experiment ${experiment.id} has no label`);
    }
    assert.equal(new Set(sources.map((s) => s.href)).size, sources.length, `Experiment ${experiment.id} lists a source twice`);
  }
});

test('what a source is said to support is really on the card', () => {
  for (const experiment of EXPERIMENTS) {
    for (const source of experiment.card.sources) {
      for (const phrase of source.supports ?? []) {
        assert.ok(
          experiment.card.livekitDoes.includes(phrase),
          `Experiment ${experiment.id}: “${phrase}” is no longer in the card. Re-read ${source.href} and update both.`,
        );
      }
    }
  }
});

test('every number on a card is backed by a source', () => {
  for (const experiment of EXPERIMENTS) {
    const backed = experiment.card.sources.flatMap((source) => source.supports ?? []).join(' | ');
    for (const number of experiment.card.livekitDoes.match(/\d+(?:\.\d+)?%?/g) ?? []) {
      assert.ok(backed.includes(number), `Experiment ${experiment.id}: nothing backs “${number}” in what LiveKit does`);
    }
  }
});

test('the date the cards were checked is a real day, not in the future', () => {
  assert.match(FACTS_CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/);
  const checked = new Date(`${FACTS_CHECKED_ON}T00:00:00Z`);
  assert.ok(!Number.isNaN(checked.getTime()));
  assert.ok(checked.getTime() <= Date.now(), 'FACTS_CHECKED_ON is in the future');
});
