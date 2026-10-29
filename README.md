# Mozhiverse

Mozhiverse is a mobile-first real-time conversation room for people who communicate in different languages or use different speech and hearing modes. It supports six Indian languages, translated text, browser speech input/output, large readable captions, quick phrases, QR room sharing, transcript download, and device-level accessibility settings.

## Architecture

```text
┌────────────────────┐       Socket.IO / HTTP       ┌──────────────────────┐
│ React + Vite + PWA │ ◄──────────────────────────► │ Express + Socket.IO  │
│ Web Speech API     │                              │ In-memory rooms      │
│ speechSynthesis    │                              │ TranslationProvider  │
└────────────────────┘                              └──────────┬───────────┘
                                                               │
                                          Google Translate key │ if configured
                                                               │ otherwise
                                                       MyMemory API
```

The `shared` workspace holds the language, room, participant, and message types used by both client and server. The server keeps room membership in memory and translates each message for each recipient before emitting it. It keeps a small in-memory translation cache; there is no database.

## Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

Open the Vite address printed in the terminal (usually `http://localhost:5173`). In PowerShell, copy the example environment file with `Copy-Item .env.example .env`.

For a production build and local production server:

```sh
npm run build
npm start
```

The production server defaults to `http://localhost:3001` and serves the built client as well as the API and Socket.IO endpoint.

## Environment variables

| Name | Purpose | Default |
| --- | --- | --- |
| `PORT` | Express/Socket.IO server port | `3001` |
| `GOOGLE_TRANSLATE_API_KEY` | Optional Google Cloud Translation API key. Kept on the server. | empty; uses MyMemory |
| `CLIENT_ORIGIN` | Allowed browser origin for HTTP and Socket.IO CORS | `http://localhost:5173` |
| `ANTHROPIC_API_KEY` | Optional server-side Anthropic API key for AI tone hints | empty; uses local rule-based analyzer |

If a Google key is set, enable Cloud Translation for that project and configure billing/quotas with Google. Without a key, the app calls the free MyMemory endpoint. The cache avoids repeat requests for the same text and language pair.

## Key Features

### 1. Multimodal Communication Modes
- **Speak Mode**: Uses browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with explicit locale mapping for Tamil (`ta-IN`), English (`en-US`), Hindi (`hi-IN`), Telugu (`te-IN`), Malayalam (`ml-IN`), and Kannada (`kn-IN`). If speech recognition is unsupported or encounters an error, a clear explanation is displayed and Type mode remains fully accessible.
- **Type Mode**: Mobile-friendly composer with typing indicators and keyboard shortcuts (`Enter` to send, `Shift+Enter` for newline).
- **Deaf / Read Mode**: Enlarged high-contrast captions with visual speaker tags. **Strict audio safety**: audio playback and speech synthesis are completely disabled in Read mode to protect Deaf and hard-of-hearing users.

### 2. Quick Conversation Actions & Message Reactions
- **Accessible Clean Icon Reactions (Like, Love, Smile, Care)**: Crisp, high-contrast Lucide SVG icons with real-time in-memory counts, active highlight states, full keyboard accessibility, and screen-reader `aria-label` and `aria-pressed` announcements. Clean typography with no cluttered emojis.
- **Dedicated "Please repeat" & "Slow down"**: One-tap buttons for rapid interjection without typing.
- **Supportive Words & Care Board**: Empathetic pre-composed phrases with semantic category badges (Presence, Patience, Encouragement, Solidarity, Calm, Care).
- **Sound-to-Sight Live Voice Radar (Visual Hearing Aid)**: Real-time 16-band audio frequency spectrum and decibel gauge (`dB`) providing Deaf and Hard-of-Hearing users with visual awareness of speech cadence, intensity, and pauses without audio. Includes a one-click "Test Radar" simulation.
- **Emergency SOS Visual Beacon**: When emergency keywords are detected, an alert banner with pulsing visual strobe and 1-tap rapid response actions ("I am safe", "Need medical help", "Help is on the way") and haptic vibration pulse sequence activates automatically.
- **Editable Quick Phrases**: Fully editable touch- and keyboard-friendly phrase board with category assignment and custom text entry. All targets meet the 44px touch minimum.

### 3. Safe Emotion / Tone Hint (Optional)
- **Optional & Default OFF**: Users toggle it in Settings.
- **Text-Only Analysis**: Evaluates text punctuation and vocabulary only. Never uses voice pitch, face, camera, accent, disability, or identity.
- **Cautious Wording**: Formatted as `"Possible tone: appreciative (low confidence · courtesy keywords)"`.
- **Cultural & Linguistic Disclaimer**: Explicitly explains that automated text estimates can be wrong across diverse cultures and languages.
- **Private & Ephemeral**: Kept purely ephemeral in the UI; excluded from transcripts unless explicitly checked by the user.
- **Local Rule-Based Fallback**: Works 100% offline without external AI keys. If `ANTHROPIC_API_KEY` is present on the server, it optionally provides supplementary text classification with local fallback.

### 4. Interactive Simulation & Session Controls
- **Interactive Partner Simulator**: Enables solo demoing with a single click. When alone in a room, tap `"Simulate Remote Partner (Demo Mode)"` to bring in an automated conversational peer ("Alex" speaking English or "Priya" speaking Tamil) who speaks, types, responds, and reacts live in real time.
- **Session Duration Timer**: Displays meeting time (`⏱️ MM:SS`) live in the room header.
- **Text-to-Speech Speed Controller**: Adjustable voice speed rate ($0.5\times$ to $1.75\times$) in Settings for users needing slower speech for cognitive processing or language comprehension.
- **Synthesized Message Chime**: Web Audio API two-tone audio alert on incoming messages (toggleable in Settings, automatically silenced in Deaf/Read mode).

### 5. Transcript, Smart Meeting Minutes & Session Summary
- In-memory conversation logging with timestamps, original text, and translated text.
- **Smart Meeting Minutes & Takeaways Generator**: Automatically extracts key discussion highlights, action items, safety signals, and language statistics into an executive summary card.
- Compact summary of messages sent, participants in room, and active languages.
- One-click "Copy Transcript" and "Download .txt" (`mozhiverse-<ROOM>-transcript.txt`).

## Accessibility

The layout starts at small phone widths, uses keyboard-operable controls and visible focus styling, 44px-or-larger primary controls, live message announcements, high contrast, font-size, dark/light, dyslexia-friendly font, reduced-motion, and vibration settings. Deaf / Read mode enlarges incoming captions and does not automatically play audio. Incoming auto-speech is separately controlled by the receiver.

## Known limitations

- Speech recognition availability and accuracy depend on the browser, OS, network, microphone permission, and selected language. The app maps Tamil (`ta-IN`), English (`en-US`), Hindi (`hi-IN`), Telugu (`te-IN`), Malayalam (`ml-IN`), and Kannada (`kn-IN`). If recognition is missing or errors for a chosen language, the UI reports it and offers Type mode. Speech recognition is typically best supported in Chromium browsers.
- Speech synthesis voices are provided by the device and may not include every language.
- Free MyMemory translation can be slow, rate-limited, or inaccurate. Google Translate requires a configured server key and may incur charges. Translation latency depends on the external provider and connection; the app cannot guarantee a 1.5 second ceiling.
- Tone hints are purely text-based estimations and must not be used for psychological diagnosis or critical decision-making.
- Rooms and translation cache are memory-only. Restarting the server clears them. The service is designed for a hackathon demo, not sensitive or regulated conversations.

## Two-minute judge demo

**0:00–0:20** — Explain the barrier: one person speaks Tamil, another reads English, and a third may communicate by text or AAC. Create a room and show its QR.

**0:20–0:50** — Join on another phone/tab in English. Type a Tamil greeting and show the translated English caption; reply in English and show Tamil on the other device.

**0:50–1:15** — Switch to Deaf / Read and show the large live caption. Toggle incoming auto-speech on the other device; demonstrate the "Please repeat" or "Slow down" action and urgent message visual cue.

**1:15–1:40** — Show Speak mode with browser speech recognition (if available), then toggle Tone Hints in Settings to show cautious text-based estimation. Change font size/high contrast.

**1:40–2:00** — Open the transcript drawer, review the room summary, and download the .txt transcript. Close with the privacy-by-design demo architecture: in-memory rooms, no database, and server-side provider keys.

## Verification

```sh
npm test
npm run build
npm run test:socket
```

The server tests cover in-memory room behavior and translation caching/provider behavior. `npm run test:socket` starts two Socket.IO clients and checks Tamil-to-English and English-to-Tamil delivery through the actual room/message server flow. It uses a deterministic test double for MyMemory so the check is repeatable without an internet connection or live translation key; run the browser demo separately to try the configured real provider.
