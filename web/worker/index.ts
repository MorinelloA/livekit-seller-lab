/**
 * The lab's API on Cloudflare, served with the static pages at
 * tonyt908.com/livekitlab. Locally, `pnpm dev` runs it with Wrangler.
 *
 * POST /livekitlab/api/token   A room with the agent dispatched to it. Needs the
 *                              access code from the link (X-Lab-Code).
 * POST /livekitlab/api/pilot   Stores one event of a pilot participant's session.
 * GET  /livekitlab/api/pilot   Everything stored, for the results page (X-Lab-Admin).
 * DELETE /livekitlab/api/pilot?id=P1   Deletes one participant's events (X-Lab-Admin).
 *
 * A live voice agent costs money for every minute, so calls need the access
 * code, the API hands out a limited number of rooms a day, and the agent ends
 * every session after a set time (agent/src/common.py).
 */
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';

export interface Env {
  ASSETS: Fetcher;
  LAB: KVNamespace;
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  LAB_ACCESS_CODE: string;
  LAB_ADMIN_CODE: string;
  AGENT_NAME?: string;
  DAILY_SESSION_LIMIT?: string;
}

const API_PREFIX = '/livekitlab/api/';
const PILOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;
const MAX_EVENT_BYTES = 100_000;
// KV keeps up to 1 KB of metadata with each key, and list() returns it, so small
// events need no separate read.
const MAX_METADATA_BYTES = 900;
const TOKEN_TTL = '2m';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(API_PREFIX)) return env.ASSETS.fetch(request);
    const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '');
    try {
      if (route === 'token' && request.method === 'POST') return await token(request, env);
      if (route === 'pilot' && request.method === 'POST') return await storeEvent(request, env);
      if (route === 'pilot' && request.method === 'GET') return await listEvents(request, env);
      if (route === 'pilot' && request.method === 'DELETE') return await deleteParticipant(request, env, url);
      return text('Not found.', 404);
    } catch (err) {
      console.error('lab api error', err);
      return text('Something went wrong on the lab’s server. Try again in a moment.', 500);
    }
  },
} satisfies ExportedHandler<Env>;

/** Compares a code from a request with the real one, in constant time. */
async function matches(given: string | null, expected: string | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given.trim())),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const badCode = () => text('That access code isn’t right. If you have a link with one, the code is after “code=”.', 401);

async function token(request: Request, env: Env): Promise<Response> {
  if (!(await matches(request.headers.get('X-Lab-Code'), env.LAB_ACCESS_CODE))) return badCode();
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return text('The lab’s LiveKit keys are missing on the server.', 500);
  }
  const body = (await request.json().catch(() => ({}))) as { mode?: unknown; pilot?: unknown };
  const practice = body.mode === 'practice';
  const pilot = typeof body.pilot === 'string' && PILOT_ID.test(body.pilot) ? body.pilot : undefined;

  // A rough daily cap. KV isn't transactional, so two calls at the same moment
  // can both get through; that's fine for a cap meant to stop runaway use.
  const limit = Number(env.DAILY_SESSION_LIMIT ?? '40');
  const countKey = `sessions:${new Date().toISOString().slice(0, 10)}`;
  const count = Number((await env.LAB.get(countKey)) ?? '0');
  if (count >= limit) {
    return text('The lab has reached its limit of calls for today. Please try again tomorrow.', 429);
  }
  await env.LAB.put(countKey, String(count + 1), { expirationTtl: 3 * 24 * 60 * 60 });

  const suffix = crypto.randomUUID().slice(0, 8);
  const roomName = `${practice ? 'practice' : 'seller_lab'}_${suffix}`;
  const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: `learner_${suffix}`,
    name: pilot ?? 'Learner',
    // Only for joining, which the page does at once. LiveKit keeps a joined
    // participant's token fresh. A short life leaves little time to reuse it.
    ttl: TOKEN_TTL,
  });
  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  // The agent reads the mode, and records only a pilot participant's calls.
  const metadata: Record<string, string> = { mode: practice ? 'practice' : 'lab' };
  if (pilot) metadata.pilot = pilot;
  accessToken.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: env.AGENT_NAME || 'juniper-lab', metadata: JSON.stringify(metadata) })],
  });

  return json({ serverUrl: env.LIVEKIT_URL, roomName, participantToken: await accessToken.toJwt() });
}

async function storeEvent(request: Request, env: Env): Promise<Response> {
  if (!(await matches(request.headers.get('X-Lab-Code'), env.LAB_ACCESS_CODE))) return badCode();
  const raw = await request.text();
  if (raw.length > MAX_EVENT_BYTES) return text('That event is too big to store.', 413);
  let body: { pilot?: unknown; event?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return text('That isn’t JSON.', 400);
  }
  const { pilot, event } = body;
  if (typeof pilot !== 'string' || !PILOT_ID.test(pilot) || typeof event !== 'object' || event === null) {
    return text('An event needs a pilot code and an event.', 400);
  }
  const receivedAt = Date.now();
  const stored = JSON.stringify({ ...event, receivedAt });
  // Keys sort by participant, then time.
  const key = `pilot:${pilot}:${String(receivedAt).padStart(13, '0')}:${crypto.randomUUID().slice(0, 6)}`;
  if (stored.length <= MAX_METADATA_BYTES) {
    await env.LAB.put(key, '', { metadata: { e: stored } });
  } else {
    await env.LAB.put(key, stored);
  }
  return new Response(null, { status: 204, headers: HEADERS });
}

async function pilotKeys(env: Env, prefix: string) {
  const keys: KVNamespaceListKey<{ e?: string }>[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.LAB.list<{ e?: string }>({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

async function listEvents(request: Request, env: Env): Promise<Response> {
  if (!(await matches(request.headers.get('X-Lab-Admin'), env.LAB_ADMIN_CODE))) {
    return text('That admin code isn’t right.', 401);
  }
  const keys = await pilotKeys(env, 'pilot:');
  const participants: Record<string, unknown[]> = {};
  const events = await Promise.all(
    keys.map(async (key) => key.metadata?.e ?? (await env.LAB.get(key.name)) ?? 'null'),
  );
  keys.forEach((key, i) => {
    const id = key.name.split(':')[1];
    // One stored value that isn't JSON mustn't hide everyone else's results.
    let event: unknown = null;
    try {
      event = JSON.parse(events[i]);
    } catch {
      console.error('skipped a pilot event that isn’t JSON', key.name);
    }
    if (event) (participants[id] ??= []).push(event);
  });
  return json({ participants });
}

async function deleteParticipant(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await matches(request.headers.get('X-Lab-Admin'), env.LAB_ADMIN_CODE))) {
    return text('That admin code isn’t right.', 401);
  }
  const id = url.searchParams.get('id') ?? '';
  if (!PILOT_ID.test(id)) return text('Say which participant to delete, like ?id=P1.', 400);
  const keys = await pilotKeys(env, `pilot:${id}:`);
  await Promise.all(keys.map((key) => env.LAB.delete(key.name)));
  return json({ deleted: keys.length });
}
