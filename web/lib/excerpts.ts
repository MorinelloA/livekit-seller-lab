import fs from 'node:fs';
import path from 'node:path';

// The repository root: `next build` and `next dev` both run in web/.
const REPO = path.resolve(process.cwd(), '..');

/**
 * Lines of a source file, read when the site is built: from the first line
 * containing `from` through the next line containing `to`, plus `after` more,
 * with the shared indent removed. Throws when either is missing, so code that
 * moves breaks the build instead of leaving a stale excerpt on the page.
 */
export function excerpt(file: string, from: string, to: string, after = 0): string {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(from));
  if (start === -1) throw new Error(`Excerpt start not found in ${file}: ${from}`);
  const offset = lines.slice(start).findIndex((line) => line.includes(to));
  if (offset === -1) throw new Error(`Excerpt end not found in ${file}: ${to}`);
  const chunk = lines.slice(start, start + offset + 1 + after);
  const indent = Math.min(...chunk.filter((line) => line.trim()).map((line) => line.match(/^ */)?.[0].length ?? 0));
  return chunk.map((line) => line.slice(indent)).join('\n');
}
