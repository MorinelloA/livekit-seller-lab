// After `next build` exports the pages to out/, put them under dist/livekitlab,
// the path they're served from on tonyt908.com, and add the response headers.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const BASE = 'livekitlab';

if (!existsSync('out/index.html')) {
  console.error('out/ has no pages. Run `next build` first.');
  process.exit(1);
}
rmSync('dist', { recursive: true, force: true });
mkdirSync(`dist/${BASE}`, { recursive: true });
cpSync('out', `dist/${BASE}`, { recursive: true });

// Search engines skip the lab, and the access code in a link never leaks to
// other sites through the Referer header.
writeFileSync(
  'dist/_headers',
  [`/${BASE}/*`, '  X-Robots-Tag: noindex, nofollow', '  Referrer-Policy: no-referrer', ''].join('\n'),
);
console.log(`Staged the pages in dist/${BASE}.`);
