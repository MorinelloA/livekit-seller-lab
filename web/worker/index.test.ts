// The API's rules, run against the Worker's own fetch handler with a stand-in
// for Cloudflare KV. No LiveKit keys, no network: a token is only signed here,
// never used.
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { before, test } from 'node:test';
import worker, { type Env } from './index.ts';

const ACCESS = 'right-code';
const ADMIN = 'admin-code';

before(() => {
  // Workers have crypto.subtle.timingSafeEqual; Node keeps it in node:crypto.
  const subtle = crypto.subtle as unknown as { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean };
  subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
  console.error = () => undefined;
});

/** Enough of KV for the Worker: values, the metadata kept with a key, and listing by prefix. */
function fakeKv() {
  const store = new Map<string, { value: string; metadata?: unknown }>();
  return {
    store,
    async get(key: string) {
      return store.get(key)?.value ?? null;
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      store.set(key, { value, metadata: options?.metadata });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list({ prefix = '' }: { prefix?: string }) {
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .sort()
        .map((name) => ({ name, metadata: store.get(name)?.metadata }));
      return { keys, list_complete: true };
    },
  };
}

function setUp(overrides: Partial<Record<keyof Env, string>> = {}) {
  const kv = fakeKv();
  const env = {
    ASSETS: { fetch: async () => new Response('a page') },
    LAB: kv,
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'a-secret-long-enough-to-sign-a-token-with',
    LAB_ACCESS_CODE: ACCESS,
    LAB_ADMIN_CODE: ADMIN,
    AGENT_NAME: 'juniper-lab-test',
    DAILY_SESSION_LIMIT: '40',
    ...overrides,
  } as unknown as Env;
  const call = (path: string, init: RequestInit = {}) =>
    worker.fetch(new Request(`https://lab.test/livekitlab/${path}`, init) as never, env);
  const post = (path: string, body: unknown, headers: Record<string, string> = { 'X-Lab-Code': ACCESS }) =>
    call(path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { kv, call, post };
}

/** The claims inside a room token. */
function claims(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as {
    exp: number;
    nbf: number;
    sub: string;
    name: string;
    video: Record<string, unknown>;
    roomConfig: { agents: { agentName: string; metadata: string }[] };
  };
}

test('anything that isn’t the API is served as a page', async () => {
  const { call } = setUp();
  assert.equal(await (await call('lab/')).text(), 'a page');
});

test('a room needs the access code', async () => {
  const { post, kv } = setUp();
  const attempts: Record<string, string>[] = [{}, { 'X-Lab-Code': 'wrong-code' }, { 'X-Lab-Code': '' }];
  for (const headers of attempts) {
    const response = await post('api/token', { mode: 'lab' }, headers);
    assert.equal(response.status, 401);
    assert.match(await response.text(), /access code/);
  }
  assert.equal(kv.store.size, 0, 'a refused request doesn’t count toward the daily cap');
});

test('a lab token joins one new room, with the agent dispatched to it, for two minutes', async () => {
  const { post } = setUp();
  const response = await post('api/token', { mode: 'lab' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const { serverUrl, roomName, participantToken } = (await response.json()) as Record<string, string>;
  assert.equal(serverUrl, 'wss://example.livekit.cloud');
  assert.match(roomName, /^seller_lab_[0-9a-f]{8}$/);

  const token = claims(participantToken);
  assert.equal(token.exp - token.nbf, 120);
  assert.equal(token.name, 'Learner');
  assert.deepEqual(token.video, {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  assert.equal(token.roomConfig.agents.length, 1);
  assert.equal(token.roomConfig.agents[0].agentName, 'juniper-lab-test');
  assert.deepEqual(JSON.parse(token.roomConfig.agents[0].metadata), { mode: 'lab' });
});

test('a practice token asks the agent for the practice call', async () => {
  const { post } = setUp();
  const { roomName, participantToken } = (await (await post('api/token', { mode: 'practice' })).json()) as Record<string, string>;
  assert.match(roomName, /^practice_/);
  assert.deepEqual(JSON.parse(claims(participantToken).roomConfig.agents[0].metadata), { mode: 'practice' });
});

test('only a well-formed pilot code reaches the agent, which records those calls', async () => {
  const { post } = setUp();
  const metadataFor = async (pilot: unknown) => {
    const { participantToken } = (await (await post('api/token', { mode: 'lab', pilot })).json()) as Record<string, string>;
    return JSON.parse(claims(participantToken).roomConfig.agents[0].metadata) as Record<string, string>;
  };
  assert.deepEqual(await metadataFor('P1'), { mode: 'lab', pilot: 'P1' });
  assert.deepEqual(await metadataFor('P1"; drop'), { mode: 'lab' });
  assert.deepEqual(await metadataFor(7), { mode: 'lab' });
});

test('the daily cap stops handing out rooms', async () => {
  const { post } = setUp({ DAILY_SESSION_LIMIT: '2' });
  assert.equal((await post('api/token', {})).status, 200);
  assert.equal((await post('api/token', {})).status, 200);
  const third = await post('api/token', {});
  assert.equal(third.status, 429);
  assert.match(await third.text(), /limit of calls for today/);
});

test('without LiveKit keys the API says so, and gives out nothing', async () => {
  const { post } = setUp({ LIVEKIT_API_SECRET: '' });
  assert.equal((await post('api/token', {})).status, 500);
});

test('a pilot event needs the access code, a pilot code and an event', async () => {
  const { post, kv } = setUp();
  const event = { kind: 'consent', at: 1 };
  assert.equal((await post('api/pilot', { pilot: 'P1', event }, { 'X-Lab-Code': 'wrong' })).status, 401);
  assert.equal((await post('api/pilot', 'not json')).status, 400);
  assert.equal((await post('api/pilot', { pilot: '../P1', event })).status, 400);
  assert.equal((await post('api/pilot', { pilot: 'P1' })).status, 400);
  assert.equal((await post('api/pilot', { pilot: 'P1', event: 'x'.repeat(100_001) })).status, 413);
  assert.equal(kv.store.size, 0);
  assert.equal((await post('api/pilot', { pilot: 'P1', event })).status, 204);
  assert.equal(kv.store.size, 1);
});

test('results need the admin code, and come back grouped by participant', async () => {
  const { post, call } = setUp();
  await post('api/pilot', { pilot: 'P1', event: { kind: 'consent', at: 1 } });
  // Big enough that it's stored as a value, not as the key's metadata.
  await post('api/pilot', { pilot: 'P2', event: { kind: 'feedback', text: 'y'.repeat(2_000), at: 2 } });

  assert.equal((await call('api/pilot')).status, 401);
  assert.equal((await call('api/pilot', { headers: { 'X-Lab-Admin': ACCESS } })).status, 401);
  const response = await call('api/pilot', { headers: { 'X-Lab-Admin': ADMIN } });
  assert.equal(response.status, 200);
  const { participants } = (await response.json()) as { participants: Record<string, { kind: string; receivedAt: number }[]> };
  assert.deepEqual(Object.keys(participants).sort(), ['P1', 'P2']);
  assert.equal(participants.P1[0].kind, 'consent');
  assert.equal(typeof participants.P1[0].receivedAt, 'number');
  assert.equal(participants.P2[0].kind, 'feedback');
});

test('one stored value that isn’t JSON doesn’t hide the rest', async () => {
  const { post, call, kv } = setUp();
  await post('api/pilot', { pilot: 'P1', event: { kind: 'consent', at: 1 } });
  kv.store.set('pilot:P1:9999999999999:broken', { value: '{not json' });
  const response = await call('api/pilot', { headers: { 'X-Lab-Admin': ADMIN } });
  assert.equal(response.status, 200);
  const { participants } = (await response.json()) as { participants: Record<string, unknown[]> };
  assert.equal(participants.P1.length, 1);
});

test('deleting a participant needs the admin code, and removes only theirs', async () => {
  const { post, call, kv } = setUp();
  await post('api/pilot', { pilot: 'P1', event: { kind: 'consent', at: 1 } });
  await post('api/pilot', { pilot: 'P10', event: { kind: 'consent', at: 1 } });
  assert.equal((await call('api/pilot?id=P1', { method: 'DELETE' })).status, 401);
  assert.equal((await call('api/pilot?id=', { method: 'DELETE', headers: { 'X-Lab-Admin': ADMIN } })).status, 400);
  const response = await call('api/pilot?id=P1', { method: 'DELETE', headers: { 'X-Lab-Admin': ADMIN } });
  assert.deepEqual(await response.json(), { deleted: 1 });
  assert.deepEqual([...kv.store.keys()].map((key) => key.split(':')[1]), ['P10']);
});

test('an unknown API path is a 404, not a page', async () => {
  const { call } = setUp();
  assert.equal((await call('api/nope')).status, 404);
});
