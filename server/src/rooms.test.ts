import { afterEach, describe, expect, it } from "vitest";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  snapshot,
  resetRooms,
  validParticipant,
  addRoomMessage,
  toggleReaction
} from "./rooms.js";
import type { ChatMessage } from "@mozhiverse/shared";

const person = (id: string, name = id) => ({
  id,
  name,
  language: "Tamil" as const,
  mode: "type" as const
});

afterEach(() => resetRooms());

describe("in-memory rooms", () => {
  it("creates a six character room and admits a participant", () => {
    const code = createRoom(person("1"));
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(joinRoom(code, person("2"))?.participants).toHaveLength(2);
  });

  it("rejects unknown rooms and removes empty rooms", () => {
    expect(joinRoom("XXXXXX", person("2"))).toBeNull();
    const code = createRoom(person("1"));
    leaveRoom(code, "1");
    expect(snapshot(code)).toBeNull();
  });

  it("validates participant input", () => {
    expect(validParticipant(person("1"))).toBe(true);
    expect(validParticipant({ ...person("1"), name: "" })).toBe(false);
  });

  it("handles message reactions with toggle logic and room validation", () => {
    const code = createRoom(person("user-1"));
    joinRoom(code, person("user-2"));

    const message: ChatMessage = {
      id: "msg-123",
      roomCode: code,
      senderId: "user-1",
      senderName: "User 1",
      sourceLanguage: "Tamil",
      original: "வணக்கம்",
      translations: { English: "Hello" },
      createdAt: Date.now(),
      reactions: {}
    };

    addRoomMessage(code, message);

    // user-1 reacts with 👍
    let res = toggleReaction(code, "msg-123", "user-1", "👍");
    expect(res).not.toBeNull();
    expect(res?.["👍"]).toContain("user-1");

    // user-2 reacts with 🫂 (empathy/support)
    res = toggleReaction(code, "msg-123", "user-2", "🫂");
    expect(res?.["🫂"]).toContain("user-2");

    // user-1 toggles off 👍
    res = toggleReaction(code, "msg-123", "user-1", "👍");
    expect(res?.["👍"]).not.toContain("user-1");

    // rejects non-member reactions
    expect(toggleReaction(code, "msg-123", "non-member", "👍")).toBeNull();

    // rejects invalid reaction emoji
    expect(toggleReaction(code, "msg-123", "user-1", "🔥" as any)).toBeNull();
  });
});
