// Run with `pnpm test`. The design kit's rules for the pages' source, checked as a scan:
// each failure names the kit piece to use instead. See the README's "Layout and brand rules".
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const WEB = join(import.meta.dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}
const FILES = [...sources(join(WEB, 'app')), ...sources(join(WEB, 'components'))];

/** Every line of the pages' source that matches, as "file:line: text". */
function offenders(pattern: RegExp, skip: (file: string) => boolean = () => false): string[] {
  const found: string[] = [];
  for (const file of FILES) {
    if (skip(file)) continue;
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${relative(WEB, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim()}`);
      });
  }
  return found;
}

test('colours come from the tokens in app/globals.css, never literals', () => {
  const found = offenders(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:bg|text|border|fill|stroke)-\[#/);
  assert.deepEqual(found, [], 'Use a colour token (text-fg, bg-surface, border-line, …) from app/globals.css.');
});

test('text fields are the kit’s fields, not raw inputs', () => {
  const found: string[] = [];
  for (const file of FILES) {
    if (/ui[\\/]Field\.tsx$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const tag of source.match(/<(input|textarea)\b[\s\S]*?\/?>/g) ?? []) {
      // Radios and checkboxes are choices, drawn by their labels.
      if (/^<input\b/.test(tag) && /type="(radio|checkbox)"/.test(tag)) continue;
      found.push(`${relative(WEB, file).replace(/\\/g, '/')}: ${tag.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
  }
  assert.deepEqual(found, [], 'Use TextInput, TextArea or WrappingInput (components/ui/Field.tsx): a 3:1 edge, and 16px on touch screens.');
});

test('boxes that scroll sideways are Scrollers, so a keyboard can reach them', () => {
  // The header's nav scrolls on a phone, but its links take focus themselves.
  const found = offenders(/overflow-x-auto/, (file) => /ui[\\/]Scroller\.tsx$|shell[\\/]SiteHeader\.tsx$/.test(file));
  assert.deepEqual(found, [], 'Use Scroller (components/ui/Scroller.tsx), which can be focused and is named while it scrolls.');
});

test('type sizes come from the kit’s tokens, not pixel values', () => {
  // em-relative sizes (inline code at 0.86em) follow their text, so they pass.
  const found = offenders(/\btext-\[(\d+(\.\d+)?px|clamp)/);
  assert.deepEqual(found, [], 'Use a type token (text-label, text-small, text-card, text-lead, text-title, …) from app/globals.css.');
});

test('nothing is set larger than body text without a type token', () => {
  // Tailwind's own text-xs, text-sm and text-base are the kit's 12, 14 and 16px. From
  // 17px up, a heading or a lead takes a token, so the same thing is one size everywhere.
  const found = offenders(/\btext-(lg|[2-9]?xl)\b/);
  assert.deepEqual(found, [], 'Use text-lead (17px), text-title (22px), text-heading (30px) or a fluid token from app/globals.css.');
});

test('icons are the kit’s line icons, not glyphs', () => {
  const found = offenders(/[✓✗✔✕✖]/).filter((line) => !/:\s*(\/\/|\*|\/\*)/.test(line));
  assert.deepEqual(found, [], 'Use Icon (components/ui/Icon.tsx), or RightWrong for a right or wrong mark.');
});

test('links that leave the site are ExternalLinks', () => {
  // ExternalLink opens a new tab, so a call in progress isn't hung up, and sends no referrer.
  const found = offenders(/target="_blank"|href=["{`']https?:/, (file) => /ui[\\/]ExternalLink\.tsx$/.test(file));
  assert.deepEqual(found, [], 'Use ExternalLink (components/ui/ExternalLink.tsx).');
});

test('pages sit in the page column, not a copy of it', () => {
  const found = offenders(/max-w-\[1200px\]/);
  assert.deepEqual(found, [], 'Use the page-column utility (app/globals.css): 1200px with the kit’s gutters.');
});
