import type { Language, Mode, Participant, RoomSnapshot, ChatMessage, ReactionType } from "@mozhiverse/shared";
import { VALID_REACTIONS } from "@mozhiverse/shared";

const rooms = new Map<string, Map<string, Participant>>();
const roomMessages = new Map<string, Map<string, ChatMessage>>();

export function createRoom(owner: Participant) {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(code));
  rooms.set(code, new Map([[owner.id, owner]]));
  roomMessages.set(code, new Map());
  return code;
}

export function joinRoom(code: string, participant: Participant): RoomSnapshot | null {
  const normalized = code.toUpperCase();
  const room = rooms.get(normalized);
  if (!room) return null;
  room.set(participant.id, participant);
  if (!roomMessages.has(normalized)) {
    roomMessages.set(normalized, new Map());
  }
  return snapshot(normalized);
}

export function leaveRoom(code: string, id: string) {
  const room = rooms.get(code);
  if (!room) return;
  room.delete(id);
  if (!room.size) {
    rooms.delete(code);
    roomMessages.delete(code);
  }
  return snapshot(code);
}

export function setParticipant(code: string, id: string, patch: Partial<Pick<Participant, "language" | "mode" | "name">>) {
  const p = rooms.get(code)?.get(id);
  if (p) Object.assign(p, patch);
  return snapshot(code);
}

export function snapshot(code: string): RoomSnapshot | null {
  const room = rooms.get(code);
  return room ? { code, participants: [...room.values()].map(p => ({ ...p })) } : null;
}

export function validParticipant(p: Partial<Participant>): p is Participant {
  return (
    typeof p.id === "string" &&
    p.id.length < 80 &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    p.name.length <= 50 &&
    ["Tamil", "English", "Hindi", "Telugu", "Malayalam", "Kannada"].includes(p.language as Language) &&
    ["speak", "type", "read"].includes(p.mode as Mode)
  );
}

export function addRoomMessage(code: string, message: ChatMessage) {
  const msgs = roomMessages.get(code);
  if (msgs) {
    msgs.set(message.id, message);
  }
}

export function toggleReaction(
  code: string,
  messageId: string,
  participantId: string,
  reaction: ReactionType
): Partial<Record<ReactionType, string[]>> | null {
  // Validate room exists and participant is in room
  const room = rooms.get(code);
  if (!room || !room.has(participantId)) return null;

  // Validate reaction type
  if (!VALID_REACTIONS.includes(reaction)) return null;

  const msgs = roomMessages.get(code);
  let message = msgs?.get(messageId);
  if (!message) {
    // If message was added directly via broadcast without addRoomMessage, create placeholder or return null
    return null;
  }

  if (!message.reactions) {
    message.reactions = {};
  }

  const currentList = message.reactions[reaction] ?? [];
  const alreadyReacted = currentList.includes(participantId);

  if (alreadyReacted) {
    // Toggle off
    message.reactions[reaction] = currentList.filter(id => id !== participantId);
  } else {
    // Toggle on
    message.reactions[reaction] = [...currentList, participantId];
  }

  return message.reactions;
}

export function resetRooms() {
  rooms.clear();
  roomMessages.clear();
}
