// The program page is a proposal. These keep it from claiming more than is built.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { LABS, LAB_SHAPE, METRICS, TRACKS } from './program.ts';

const read = (file: string) => fs.readFileSync(path.join(import.meta.dirname, file), 'utf8');

test('exactly one lab is built, and it’s Lab 1', () => {
  const built = LABS.filter((lab) => lab.status === 'built');
  assert.deepEqual(built.map((lab) => lab.number), [1]);
  assert.equal(built[0].href, '/lab/');
  assert.ok(LABS.filter((lab) => lab.status === 'proposed').every((lab) => !lab.href), 'a proposed lab has nowhere to link to');
});

test('labs are numbered in order, and every area the curriculum covers has one', () => {
  assert.deepEqual(LABS.map((lab) => lab.number), LABS.map((_, i) => i + 1));
  for (const track of Object.keys(TRACKS)) {
    assert.ok(LABS.some((lab) => lab.track === track), `no lab covers ${track}`);
  }
});

test('every lab fills in all six parts', () => {
  assert.equal(LAB_SHAPE.length, 6);
  for (const lab of LABS) {
    for (const part of ['customerSays', 'predict', 'hear', 'tryIt', 'askThis', 'check', 'practice'] as const) {
      assert.ok(lab[part].trim().length > 20, `Lab ${lab.number} needs more for “${part}”`);
    }
    assert.match(lab.customerSays, /^“.*”$/, `Lab ${lab.number}: what the customer says is a quote`);
    assert.match(lab.askThis, /^“.*”$/, `Lab ${lab.number}: the question to ask is a quote`);
  }
});

test('each measure’s “recorded today” names events the pilot really records', () => {
  const pilot = read('pilot.ts');
  assert.equal(METRICS.length, 4);
  for (const row of METRICS) {
    assert.ok(row.pilotKinds.length > 0, `${row.metric} points at nothing`);
    for (const kind of row.pilotKinds) {
      assert.ok(pilot.includes(`kind: '${kind}'`), `${row.metric}: lib/pilot.ts has no “${kind}” event`);
    }
  }
});

test('the parts of Lab 1 that the page links to exist', () => {
  const pages: Record<string, string> = {
    '/lab/': read('../components/Lab.tsx') + read('../components/LabOutline.tsx'),
    '/build/': read('../app/build/page.tsx'),
    '/practice/': '',
  };
  for (const part of LAB_SHAPE) {
    const [page, anchor] = part.href.split('#');
    assert.ok(page in pages, `${part.name} links to ${page}`);
    if (!anchor) continue;
    // Experiment sections get their ids from a template; the others are written out.
    const known = anchor.startsWith('experiment-') ? /experiment-\$\{/.test(pages[page]) : pages[page].includes(`"${anchor}"`);
    assert.ok(known, `${part.name}: no #${anchor} on ${page}`);
  }
});
