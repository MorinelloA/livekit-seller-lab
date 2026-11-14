// Copies the hosted lab's secrets from ../.env.local to the Cloudflare Worker,
// through Wrangler's stdin, so they're never printed or written anywhere else.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NAMES = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LAB_ACCESS_CODE', 'LAB_ADMIN_CODE'];

const env = {};
for (const line of readFileSync('../.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const missing = NAMES.filter((name) => !env[name]);
if (missing.length) {
  console.error(`Fill these in ../.env.local first: ${missing.join(', ')}`);
  process.exit(1);
}

const secrets = Object.fromEntries(NAMES.map((name) => [name, env[name]]));
const child = spawn('pnpm exec wrangler secret bulk', { shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify(secrets));
child.on('exit', (code) => process.exit(code ?? 1));
