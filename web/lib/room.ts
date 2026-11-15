import {
  ConnectionState,
  ParticipantEvent,
  ParticipantKind,
  RemoteParticipant,
  Room,
  RoomEvent,
} from 'livekit-client';

/** The livekit-client classes a scripted room builds itself from: the same ones the page uses. */
export const LIVEKIT = { ConnectionState, ParticipantEvent, ParticipantKind, RemoteParticipant, Room, RoomEvent };

export type FakeRoomFactory = (livekit: typeof LIVEKIT) => Room;

/**
 * The room a call joins. Only a build made with NEXT_PUBLIC_LAB_FAKE_ROOM=1
 * takes a scripted room from `window.__labFakeRoom`, so the UI capture
 * harness can show a call without LiveKit or the agent. Every other build,
 * the hosted lab's included, always joins a real room.
 */
export function createRoom(): Room {
  const fake =
    process.env.NEXT_PUBLIC_LAB_FAKE_ROOM === '1'
      ? (globalThis as { __labFakeRoom?: FakeRoomFactory }).__labFakeRoom
      : undefined;
  return fake ? fake(LIVEKIT) : new Room();
}
