// `pnpm dev`: the pages with Next on :3100 and the API with Wrangler on :8790,
// both reading the keys in ../.env.local. Next forwards /livekitlab/api to
// Wrangler (next.config.ts). Stop both with Ctrl+C.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const API_PORT = process.env.LAB_API_PORT ?? '8790';

// Wrangler wants the assets folder to exist, even before the first build.
mkdirSync('dist', { recursive: true });

// ../.env.test.local, if it's there, overrides values for local testing only,
// such as throwaway access and admin codes.
const envFiles = ['../.env.local', '../.env.test.local']
  .filter((file) => existsSync(file))
  .map((file) => `--env-file ${file}`)
  .join(' ');

const run = (name, command) => {
  const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => `[${name}] ${line}`)
      .join('\n');
  child.stdout.on('data', (chunk) => console.log(prefix(chunk)));
  child.stderr.on('data', (chunk) => console.error(prefix(chunk)));
  child.on('exit', (code) => {
    console.log(`[${name}] exited (${code ?? 'signal'}).`);
    process.exit(code ?? 0);
  });
  return child;
};

const children = [
  run('api', `pnpm exec wrangler dev --port ${API_PORT} --ip 127.0.0.1 ${envFiles} --persist-to .wrangler/state`),
  run('web', 'pnpm exec next dev --turbopack --port 3100'),
];

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    children.forEach((child) => child.kill());
    process.exit(0);
  });
}
