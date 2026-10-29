# 🌐 Mozhiverse (மொழிverse): Universal Multimodal Accessible Live Voice & Text Bridge

> **Bridging Speech, Hearing, and Language Diversity in Real-Time Conversations**  
> *"Mozhi" (மொழி) — The universe of language and accessible human communication.*  
> *Built with FastAPI, WebSockets, Deep Translation Engine, Web Speech STT/TTS, and Assistive AAC Soundboard.*

---

## 🎯 The Problem

In live communication, participants encounter friction across three distinct dimensions:
1. **Language Barriers**: A participant speaking Tamil needs to interact with an English speaker.
2. **Hearing Diversity**: A participant who is deaf or hard-of-hearing cannot rely on voice audio and requires real-time, high-contrast captions.
3. **Speech Diversity**: A non-verbal / speech-impaired participant must type or select AAC symbols, but other participants need to hear their contributions as spoken audio in their native language.
4. **Conversational Realities**: Overlapping speech, interruptions, recognition latency, out-of-order translations, and shaky connections often break conventional single-purpose translation apps.

---

## 🚀 The Mozhiverse Solution

Mozhiverse delivers a unified, synchronized communication room where **each participant communicates through their preferred input modality and receives content in their preferred output modality and language**.

```mermaid
flowchart TD
    subgraph Anand["🇮🇳 Anand (Tamil Voice)"]
        A_mic["🎙️ Tamil Speech"] --> A_ws["Web Speech STT"]
        A_audio["🔊 Tamil TTS Audio"] <-- A_recv["Audio Playback"]
    end

    subgraph Server["Mozhiverse FastAPI Backend"]
        WM["WebSocket Room Manager & Turn Sequencer"]
        TE["Multi-Provider Translation Engine (Tamil ↔ English ↔ Any)"]
        WM <--> TE
        IC["Interruption & Barge-In Detector"]
        WM --> IC
    end

    subgraph Sarah["🦻 Sarah (Hard of Hearing)"]
        S_cc["📝 Live High-Contrast Captions (English)"] <-- S_recv["CC Banner"]
        S_type["⌨️ Text Input / Hybrid"] --> S_ws["WebSocket Out"]
    end

    subgraph Liam["🔇 Liam (Non-Verbal / AAC)"]
        L_aac["🔤 AAC Soundboard (1-Click)"] --> L_ws["AAC Dispatch"]
        L_type["⌨️ Typed Text"] --> L_ws
        L_out["🔊 English Audio + 📝 Captions"] <-- L_recv["Dual Modality"]
    end

    A_ws --> WM
    WM --> A_recv
    WM --> S_recv
    S_ws --> WM
    L_ws --> WM
    WM --> L_recv
```

---

## 🌟 Key Features & Architectural Innovations

### 1. Independent Input & Output Modalities
Every participant independently configures:
- **Input Modality**: Voice (Microphone), Text (Keyboard), or Hybrid.
- **Output Modality**: Voice Audio (Synthesized TTS), Live Captions (Visual subtitles), or Both.
- **Preferred Language**: Tamil (`ta`), English (`en`), Hindi (`hi`), Spanish (`es`), French (`fr`), German (`de`), Japanese (`ja`), Telugu (`te`), etc.

### 2. Conversational Continuity & Canonical Ordering
- **Sequence IDs & Turn Timestamps**: Every turn receives a canonical, monotonically increasing sequence number (`#1, #2, ...`) from the server.
- **Interim Speech Hypotheses**: As a participant speaks, real-time interim recognition hypotheses are streamed with a waveform pulse (`"..."`), distinguishing incomplete thoughts from finalized statements.

### 3. Interruption & Barge-in Handling
- When someone interrupts or a new turn begins, an `interruption` event is broadcast.
- The receiving clients automatically invoke `window.speechSynthesis.cancel()`, preventing obsolete audio from overlapping or playing out-of-context.

### 4. AAC (Augmentative and Alternative Communication) Soundboard
- Non-verbal participants have a dedicated 1-click soundboard for essential conversational actions:
  - 👍 *"I Agree"*
  - ✋ *"Wait, I am typing..."* (holds the floor)
  - ❓ *"I have a question"*
  - 🔄 *"Please repeat"*
  - ❌ *"I disagree"*
  - 🙏 *"Thank you"*
- Triggers instant translation and voice synthesis in the listeners' languages!

### 5. Network Resilience & Auto-Reconnection
- Client-side outbox queue: typed or spoken messages are preserved locally if the network blinks and automatically flushed upon reconnect.
- Reconnection with exponential backoff.

---

## 🛠️ Tech Stack

- **Backend**: Python 3, FastAPI, Uvicorn, WebSockets, Pydantic.
- **Translation Pipeline**: `deep-translator` (MyMemory API, GoogleTranslator fallback, and instant conversational phrasebook for zero-latency responses).
- **Frontend**: Responsive Single-Page Application, Tailwind CSS, Lucide Icons, Glassmorphism UI.
- **Speech Technologies**:
  - Browser **Web Speech Recognition API** (`SpeechRecognition` / `webkitSpeechRecognition`) for local, zero-lag voice input.
  - Browser **Web Speech Synthesis API** (`speechSynthesis`) for native, low-latency text-to-speech rendering in user's target language.

---

## 🏁 How to Run

### Step 1: Start the FastAPI Server
Open a terminal in `C:\Users\VIJAY\omni_bridge`:
```bash
python main.py
```
*The server will start on `http://127.0.0.1:8000`.*

### Step 2: Open in Browser
Visit [http://127.0.0.1:8000](http://127.0.0.1:8000) in Google Chrome or Microsoft Edge.

### Step 3: Run the Live Demo!
- **Method A (1-Click Auto Demo)**: Click the **"Auto 3-Way Demo"** button on the top navigation bar to watch the complete 3-participant live conversation unfold automatically!
- **Method B (Multi-Tab Live Test)**:
  - Tab 1: Select preset **"Anand (Tamil Voice)"**.
  - Tab 2: Open `http://127.0.0.1:8000` and select preset **"Sarah (Deaf Captions)"**.
  - Tab 3: Open `http://127.0.0.1:8000` and select preset **"Liam (Mute AAC)"**.
  - Speak in Tamil in Tab 1, observe instant English captions in Tab 2, and type in Tab 3 to hear spoken Tamil in Tab 1!
- **Method C (Automated Terminal Test)**:
  Run the automated simulation script:
  ```bash
  python test_client.py
  ```

---

## 🏆 Hackathon Persona Demonstration Walkthrough

| Participant | Profile | What they do | What peers experience |
| :--- | :--- | :--- | :--- |
| **Anand** 🇮🇳 | Tamil Speaker, Voice Input, Audio Output | Speaks *"வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?"* into microphone | **Sarah** reads English CC: *"Hello! Can you hear me?"*<br>**Liam** reads English CC and hears English audio. |
| **Sarah** 🦻 | Hard of Hearing, English Language, Captions Output | Types *"Yes Anand, I can read your speech captions clearly in English."* | **Anand** hears Tamil TTS audio: *"ஆம் ஆனந்த், உங்கள் தலைப்புகளை என்னால் தெளிவாக படிக்க முடிகிறது."* |
| **Liam** 🔇 | Non-Verbal, English Language, AAC Soundboard | Clicks AAC tile *"Wait, I am typing..."* | **Anand** hears Tamil TTS: *"தயவுசெய்து காத்திருங்கள், நான் தட்டச்சு செய்கிறேன்"*<br>**Sarah** sees floor-hold notification. |
