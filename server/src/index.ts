import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setParticipant,
  snapshot,
  validParticipant,
  addRoomMessage,
  toggleReaction
} from "./rooms.js";
import { CachedTranslator, GoogleProvider, MyMemoryProvider } from "./translation.js";
import {
  LANGUAGES,
  VALID_REACTIONS,
  isEmergency,
  isSupportive,
  toneHint,
  type ChatMessage,
  type Language,
  type Participant,
  type ReactionType,
  type ToneHintResult
} from "@mozhiverse/shared";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const supportedLanguages = Object.keys(LANGUAGES) as Language[];
const allowedOrigins = [origin, `http://localhost:${port}`, `http://127.0.0.1:${port}`];

app.use(cors({
  origin: (requestOrigin, callback) => {
    if (!requestOrigin || allowedOrigins.includes(requestOrigin)) callback(null, true);
    else callback(new Error("Origin is not allowed"));
  }
}));
app.use(express.json({ limit: "15kb" }));

const translator = new CachedTranslator(
  process.env.GOOGLE_TRANSLATE_API_KEY
    ? new GoogleProvider(process.env.GOOGLE_TRANSLATE_API_KEY)
    : new MyMemoryProvider()
);

const hits = new Map<string, { count: number; reset: number }>();
const msgHits = new Map<string, { count: number; reset: number }>();

function rateLimit(map: Map<string, { count: number; reset: number }>, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = map.get(key);
  if (h && h.reset > now && h.count >= limit) return false;
  map.set(key, !h || h.reset < now ? { count: 1, reset: now + windowMs } : { count: h.count + 1, reset: h.reset });
  return true;
}

app.post("/api/translate", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (!rateLimit(hits, ip, 45, 60_000)) return res.status(429).json({ error: "Rate limit exceeded" });

  const { text, source, target } = req.body ?? {};
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 2000 ||
    !supportedLanguages.includes(source as Language) ||
    !supportedLanguages.includes(target as Language)
  ) {
    return res.status(400).json({ error: "Invalid translation request" });
  }

  try {
    const translation = await translator.translate(text, source as Language, target as Language);
    return res.json({ translation });
  } catch {
    return res.status(502).json({ error: "Translation is temporarily unavailable" });
  }
});

app.post("/api/tone", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    return res.status(400).json({ error: "Invalid text" });
  }

  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY;
  if (aiKey && aiKey.startsWith("sk-ant-")) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": aiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: `Analyze the possible tone of this meeting text: "${text}". Reply with pure JSON ONLY: {"tone":"one word tone","confidence":"low" or "medium","reason":"brief text reason under 12 words"}. Cautious estimate only; do not infer personality or health.`
          }]
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const json = await resp.json() as any;
        const reply = json.content?.[0]?.text;
        const parsed = JSON.parse(reply.replace(/```json|```/g, "").trim());
        if (parsed?.tone) {
          return res.json({
            tone: String(parsed.tone).toLowerCase(),
            confidence: parsed.confidence === "medium" ? "medium" : "low",
            reason: String(parsed.reason || "AI text-based evaluation")
          });
        }
      }
    } catch {
      // Fallback to rule-based
    }
  }

  const result: ToneHintResult | null = toneHint(text);
  return res.json(result ?? { tone: "neutral", confidence: "low", reason: "Standard conversational phrasing" });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(resolve(clientDist, "index.html"), err => err && next());
});

const http = createServer(app);
const io = new Server(http, { cors: { origin: allowedOrigins, methods: ["GET", "POST"] } });

function validLanguage(x: unknown): x is Language {
  return supportedLanguages.includes(String(x) as Language);
}

io.on("connection", socket => {
  let roomCode: string | undefined;
  let self: Participant | undefined;

  socket.on("room:create", (p: Participant, ack: (x: unknown) => void) => {
    if (!validParticipant({ ...p, id: socket.id })) {
      return ack({ error: "Please enter a name and supported language" });
    }
    self = { ...p, id: socket.id, name: p.name.trim().slice(0, 50) };
    roomCode = createRoom(self);
    socket.join(roomCode);
    ack({ room: snapshot(roomCode), roomCode });
  });

  socket.on("room:join", (payload: { code: string; participant: Participant }, ack: (x: unknown) => void) => {
    const code = String(payload?.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code) || !validParticipant({ ...payload?.participant, id: socket.id })) {
      return ack({ error: "Check the room code, name, and language" });
    }
    self = { ...payload.participant, id: socket.id, name: payload.participant.name.trim().slice(0, 50) };
    roomCode = code;
    const room = joinRoom(code, self);
    if (!room) {
      roomCode = undefined;
      self = undefined;
      return ack({ error: "Room not found. Check the six-character code." });
    }
    socket.join(code);
    ack({ room, roomCode: code });
    io.to(code).emit("room:update", room);
  });

  socket.on("room:simulate", async (ack?: (x: unknown) => void) => {
    if (!roomCode || !self) return ack?.({ error: "Join a room first" });
    const currentRoom = snapshot(roomCode);
    if (!currentRoom) return ack?.({ error: "Room not found" });

    // Pick a complementary language
    const simLang: Language = self.language === "Tamil" ? "English" : "Tamil";
    const simName = simLang === "English" ? "Alex (English)" : "Priya (தமிழ்)";
    const simId = "sim-" + randomUUID().slice(0, 6);

    const simParticipant: Participant = {
      id: simId,
      name: simName,
      language: simLang,
      mode: "speak"
    };

    const updated = joinRoom(roomCode, simParticipant);
    if (updated) {
      io.to(roomCode).emit("room:update", updated);
    }
    ack?.({ ok: true, participant: simParticipant });

    // Simulate typing and greeting after 1.5s
    setTimeout(() => {
      const r = snapshot(roomCode!);
      if (!r || !r.participants.some(p => p.id === simId)) return;

      io.to(roomCode!).emit("participant:activity", { id: simId, typing: true });

      setTimeout(async () => {
        io.to(roomCode!).emit("participant:activity", { id: simId, typing: false });

        const simGreeting = simLang === "English"
          ? "Hello! Great to connect with you on Mozhiverse. How are you doing today?"
          : "வணக்கம்! மொழிவர்ஸில் உங்களை சந்தித்ததில் மிக்க மகிழ்ச்சி.";

        const uniqueLangs = Array.from(new Set(r.participants.map(p => p.language)));
        const translations: Partial<Record<Language, string>> = {};

        await Promise.all(uniqueLangs.map(async tLang => {
          if (tLang === simLang) translations[tLang] = simGreeting;
          else {
            try {
              translations[tLang] = await translator.translate(simGreeting, simLang, tLang);
            } catch {
              translations[tLang] = simGreeting;
            }
          }
        }));

        const msg: ChatMessage = {
          id: randomUUID(),
          roomCode: roomCode!,
          senderId: simId,
          senderName: simName,
          sourceLanguage: simLang,
          original: simGreeting,
          translations,
          createdAt: Date.now(),
          reactions: {}
        };

        addRoomMessage(roomCode!, msg);
        io.to(roomCode!).emit("message:new", msg);
      }, 1500);
    }, 1200);
  });

  socket.on("participant:update", (patch: { language?: Language; mode?: Participant["mode"] }) => {
    if (!roomCode || !self) return;
    if (patch.language && !validLanguage(patch.language)) return;
    if (patch.mode && !["speak", "type", "read"].includes(patch.mode)) return;
    if (patch.language) self.language = patch.language;
    if (patch.mode) self.mode = patch.mode;
    const room = setParticipant(roomCode, socket.id, patch);
    if (room) io.to(roomCode).emit("room:update", room);
  });

  socket.on("participant:activity", (activity: { typing?: boolean; speaking?: boolean }) => {
    if (!roomCode || !self) return;
    socket.to(roomCode).emit("participant:activity", {
      id: socket.id,
      typing: !!activity?.typing,
      speaking: !!activity?.speaking
    });
  });

  socket.on("message:send", async (payload: { text: string; sourceLanguage: Language; id?: string }, ack?: (x: unknown) => void) => {
    if (
      !roomCode ||
      !self ||
      typeof payload?.text !== "string" ||
      !payload.text.trim() ||
      payload.text.length > 2000 ||
      !validLanguage(payload.sourceLanguage)
    ) {
      return ack?.({ error: "Message is empty or invalid" });
    }
    if (!rateLimit(msgHits, socket.id, 40, 60_000)) {
      return ack?.({ error: "Too many messages. Please slow down." });
    }
    if (payload.sourceLanguage !== self.language) {
      return ack?.({ error: "Source language must match your language" });
    }

    const room = snapshot(roomCode);
    if (!room) return ack?.({ error: "Room no longer exists" });

    const rawText = payload.text.trim();
    const uniqueLangs = Array.from(new Set(room.participants.map(p => p.language)));
    const translations: Partial<Record<Language, string>> = {};

    await Promise.all(uniqueLangs.map(async (targetLang) => {
      if (targetLang === payload.sourceLanguage) {
        translations[targetLang] = rawText;
        return;
      }
      try {
        translations[targetLang] = await translator.translate(rawText, payload.sourceLanguage, targetLang);
      } catch {
        translations[targetLang] = rawText;
      }
    }));

    const message: ChatMessage = {
      id: payload.id ?? randomUUID(),
      roomCode,
      senderId: socket.id,
      senderName: self.name,
      sourceLanguage: payload.sourceLanguage,
      original: rawText,
      translations,
      createdAt: Date.now(),
      isUrgent: isEmergency(rawText),
      isSupportive: isSupportive(rawText),
      tone: toneHint(rawText) ?? undefined,
      reactions: {}
    };

    addRoomMessage(roomCode, message);
    io.to(roomCode).emit("message:new", message);
    ack?.({ ok: true, id: message.id });

    // Check if a simulated partner is in this room; if so, trigger simulated response
    const simPartner = room.participants.find(p => p.id.startsWith("sim-"));
    if (simPartner) {
      // 1. Sim partner reacts with 👍 after 1.2s
      setTimeout(() => {
        const reactions = toggleReaction(roomCode!, message.id, simPartner.id, "👍");
        if (reactions) {
          io.to(roomCode!).emit("message:reaction", {
            messageId: message.id,
            reactions
          });
        }
      }, 1200);

      // 2. Sim partner types and replies after 2.5s
      setTimeout(() => {
        const curr = snapshot(roomCode!);
        if (!curr || !curr.participants.some(p => p.id === simPartner.id)) return;

        io.to(roomCode!).emit("participant:activity", { id: simPartner.id, typing: true });

        setTimeout(async () => {
          io.to(roomCode!).emit("participant:activity", { id: simPartner.id, typing: false });

          let replyText = "";
          const lower = rawText.toLowerCase();
          if (isEmergency(rawText)) {
            replyText = simPartner.language === "English"
              ? "Emergency noted! Stay calm, assistance has been notified."
              : "அவசர நிலை பதிவு செய்யப்பட்டது! அமைதியாக இருங்கள்.";
          } else if (lower.includes("repeat") || lower.includes("மீண்டும்")) {
            replyText = simPartner.language === "English"
              ? "Sure! I'll repeat that more slowly."
              : "நிச்சயமாக! நான் அதை இன்னும் தெளிவாக கூறுகிறேன்.";
          } else if (lower.includes("slow") || lower.includes("மெதுவாக")) {
            replyText = simPartner.language === "English"
              ? "Understood, slowing down our conversation pace."
              : "புரிந்தது, இனி மெதுவாக உரையாடுவோம்.";
          } else {
            replyText = simPartner.language === "English"
              ? "I understand. Thank you for sharing!"
              : "புரிந்தது. பகிர்ந்தமைக்கு நன்றி!";
          }

          const targetLangs = Array.from(new Set(curr.participants.map(p => p.language)));
          const replyTranslations: Partial<Record<Language, string>> = {};

          await Promise.all(targetLangs.map(async tLang => {
            if (tLang === simPartner.language) replyTranslations[tLang] = replyText;
            else {
              try {
                replyTranslations[tLang] = await translator.translate(replyText, simPartner.language, tLang);
              } catch {
                replyTranslations[tLang] = replyText;
              }
            }
          }));

          const simReplyMsg: ChatMessage = {
            id: randomUUID(),
            roomCode: roomCode!,
            senderId: simPartner.id,
            senderName: simPartner.name,
            sourceLanguage: simPartner.language,
            original: replyText,
            translations: replyTranslations,
            createdAt: Date.now(),
            reactions: {}
          };

          addRoomMessage(roomCode!, simReplyMsg);
          io.to(roomCode!).emit("message:new", simReplyMsg);
        }, 1800);
      }, 2400);
    }
  });

  socket.on("message:react", (payload: { messageId: string; reaction: ReactionType }, ack?: (x: unknown) => void) => {
    if (!roomCode || !self) return ack?.({ error: "Not in a room" });
    if (typeof payload?.messageId !== "string" || !payload.messageId) {
      return ack?.({ error: "Invalid message ID" });
    }
    if (!VALID_REACTIONS.includes(payload?.reaction)) {
      return ack?.({ error: "Invalid reaction. Supported: 👍, ❤️, 😂" });
    }

    const reactions = toggleReaction(roomCode, payload.messageId, socket.id, payload.reaction);
    if (!reactions) {
      return ack?.({ error: "Message not found or reaction failed" });
    }

    io.to(roomCode).emit("message:reaction", {
      messageId: payload.messageId,
      reactions
    });
    ack?.({ ok: true, reactions });
  });

  socket.on("disconnect", () => {
    if (!roomCode) return;
    const updated = leaveRoom(roomCode, socket.id);
    io.to(roomCode).emit("participant:left", { id: socket.id, name: self?.name });
    if (updated) io.to(roomCode).emit("room:update", updated);
  });
});

const server = http.listen(port, () => console.log(`Mozhiverse server on ${port}`));
export { app, io, server };
