// Run with `pnpm test` (node --test; Node strips the types).
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Room } from 'livekit-client';
import { createRoom, type FakeRoomFactory, LIVEKIT } from './room.ts';

const scope = globalThis as { __labFakeRoom?: FakeRoomFactory };

afterEach(() => {
  delete process.env.NEXT_PUBLIC_LAB_FAKE_ROOM;
  delete scope.__labFakeRoom;
});

class ScriptedRoom extends Room {}

test('joins a real room when the build has no fake-room flag, even if the page offers a fake', () => {
  scope.__labFakeRoom = () => new ScriptedRoom();
  const room = createRoom();
  assert.ok(room instanceof Room);
  assert.ok(!(room instanceof ScriptedRoom));
});

test('takes the scripted room in a fake-room build, and hands it the page’s livekit-client classes', () => {
  process.env.NEXT_PUBLIC_LAB_FAKE_ROOM = '1';
  let given: unknown;
  scope.__labFakeRoom = (livekit) => {
    given = livekit;
    return new ScriptedRoom();
  };
  assert.ok(createRoom() instanceof ScriptedRoom);
  assert.equal(given, LIVEKIT);
});

test('falls back to a real room in a fake-room build when the page offers none', () => {
  process.env.NEXT_PUBLIC_LAB_FAKE_ROOM = '1';
  const room = createRoom();
  assert.ok(room instanceof Room);
  assert.ok(!(room instanceof ScriptedRoom));
});
