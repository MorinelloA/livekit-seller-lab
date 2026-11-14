// Development only: saves recorded test-caller runs for the overview's replay.
//
//   node scripts/capture-server.mjs
//
// Then open the lab with ?capture on its address (http://localhost:3100/livekitlab/lab/?capture),
// call Juniper and play a test caller. Each finished run is saved twice:
//   lib/replays/<name>.json   the timeline, the run's events and the clips' peaks
//   public/replay/<name>.wav  what a listener heard, the caller and Juniper together
// `pnpm dev` forwards /livekitlab/dev-capture/* here (next.config.ts).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.CAPTURE_PORT ?? 8799);
const ROOT = path.resolve(import.meta.dirname, '..');
const FOLDERS = { '.json': path.join(ROOT, 'lib', 'replays'), '.wav': path.join(ROOT, 'public', 'replay') };
const MAX_BYTES = 20 * 1024 * 1024;

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '').split('?')[0].split('/').pop() ?? '');
    const folder = FOLDERS[path.extname(name)];
    if (req.method !== 'POST' || !/^[a-z0-9-]+\.(json|wav)$/.test(name) || !folder) {
      res.writeHead(400).end('POST a file named like exp1-baseline.json or exp1-baseline.wav.');
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) req.destroy(new Error('too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, name), Buffer.concat(chunks));
      console.log(`saved ${path.relative(ROOT, path.join(folder, name))} (${Math.round(size / 1024)} KB)`);
      res.writeHead(200).end('saved');
    });
    req.on('error', () => res.writeHead(413).end('That file is too large.'));
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Saving replay captures on http://127.0.0.1:${PORT}`));
