/**
 * Mozhiverse - 3-Person Concurrent Multimodal Communication Engine
 * Allows communicating across Anand (Tamil Voice), Sarah (Deaf Captions),
 * and Liam (Non-Verbal Voice) concurrently on the same webpage at once.
 */

const state = {
  clientId: 'hub_' + Math.random().toString(36).substring(2, 9),
  roomId: 'live-conference',
  isAudioMuted: false,
  isHighContrast: false,
  captionSize: 15,
  anandMicActive: false,
  recognition: null,
  websocket: null,
  seqCount: 1
};

// --- Neural Audio Synthesis Player ---
class MultiAudioPlayer {
  constructor() {
    this.currentAudio = null;
  }

  playAudio(dataUri, onDone) {
    if (state.isAudioMuted || !dataUri) {
      if (onDone) onDone();
      return;
    }
    this.stop();
    const audio = new Audio(dataUri);
    this.currentAudio = audio;
    audio.onended = () => {
      this.currentAudio = null;
      if (onDone) onDone();
    };
    audio.onerror = () => {
      this.currentAudio = null;
      if (onDone) onDone();
    };
    audio.play().catch(() => {
      if (onDone) onDone();
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

const audioPlayer = new MultiAudioPlayer();

// --- WebSocket Connection ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/room/${state.roomId}/${state.clientId}`;

  const ws = new WebSocket(wsUrl);
  state.websocket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'register',
      name: 'Conference Hub',
      language: 'en',
      input_modality: 'both',
      output_modality: 'both'
    }));
  };

  ws.onclose = () => setTimeout(initWebSocket, 2000);
  ws.onerror = (e) => console.warn("WS:", e);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        renderGlobalMessage(data);
      } else if (data.type === 'interim_speech') {
        renderInterimCaptions(data.sender_name, data.text);
      } else if (data.type === 'cancel_audio') {
        audioPlayer.stop();
        showBargeInAlert();
      }
    } catch (e) {}
  };
}

// =========================================================================
// 1. ANAND ACTIONS (Tamil Voice Speaker)
// =========================================================================

function toggleAnandMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is supported natively in Chrome and Edge.");
    return;
  }

  const btn = document.getElementById('anandMicBtn');
  const text = document.getElementById('anandMicText');

  if (state.anandMicActive) {
    if (state.recognition) state.recognition.stop();
    state.anandMicActive = false;
    btn.classList.remove('is-active');
    text.textContent = "Speak in Tamil (Live Mic)";
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ta-IN'; // Tamil language

    recognition.onstart = () => {
      state.anandMicActive = true;
      btn.classList.add('is-active');
      text.textContent = "Listening to Tamil... (Click to Stop)";
      highlightSpeaker('panelAnand');
    };

    let silenceTimer = null;
    let latestText = '';

    recognition.onresult = (event) => {
      let interim = '';
      let finalized = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalized += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim) {
        latestText = interim;
        renderInterimCaptions("Anand (Tamil Voice)", interim);
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (latestText && latestText.trim()) {
            commitAnandSpeech(latestText.trim());
            latestText = '';
          }
        }, 1100);
      }

      if (finalized) {
        if (silenceTimer) clearTimeout(silenceTimer);
        latestText = '';
        commitAnandSpeech(finalized.trim());
      }
    };

    recognition.onend = () => {
      if (state.anandMicActive) {
        try { recognition.start(); } catch (err) {}
      } else {
        btn.classList.remove('is-active');
        text.textContent = "Speak in Tamil (Live Mic)";
      }
    };

    recognition.start();
    state.recognition = recognition;
  } catch (err) {
    console.error("Mic error:", err);
  }
}

function sendAnandText() {
  const input = document.getElementById('anandTextInput');
  const text = input.value.trim();
  if (!text) return;
  commitAnandSpeech(text);
  input.value = '';
}

async function commitAnandSpeech(text) {
  highlightSpeaker('panelAnand');

  // Translate Anand's Tamil text to English for Sarah & Liam
  let englishTranslation = text;
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, source_lang: 'ta', target_lang: 'en' })
    });
    const data = await res.json();
    englishTranslation = data.translated_text || text;
  } catch (e) {}

  // 1. Update Sarah's live subtitles in English
  updateSarahScreen("Anand (Tamil Speaker)", englishTranslation);

  // 2. Add to canonical transcript
  addTranscriptRow("Anand (Tamil Speaker)", text, englishTranslation, "Voice Mic");

  // 3. Broadcast to WebSocket
  if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
    state.websocket.send(JSON.stringify({
      type: 'message',
      text: text,
      input_modality: 'speech'
    }));
  }
}

// =========================================================================
// 2. SARAH ACTIONS (Deaf Communicator)
// =========================================================================

function updateSarahScreen(speakerName, englishText) {
  const subtitleEl = document.getElementById('sarahSubtitlesText');
  const speakerTag = document.getElementById('sarahSpeakerTag');
  subtitleEl.innerHTML = `<span class="caption-highlight">${escapeHtml(englishText)}</span>`;
  speakerTag.textContent = `Live Speaker: ${speakerName}`;
}

function renderInterimCaptions(speakerName, interimText) {
  const subtitleEl = document.getElementById('sarahSubtitlesText');
  const speakerTag = document.getElementById('sarahSpeakerTag');
  subtitleEl.innerHTML = `<span class="text-[#FFE082]">${escapeHtml(interimText)}</span> <span class="animate-pulse">|</span>`;
  speakerTag.textContent = `Speaking: ${speakerName}`;
}

async function sendSarahText() {
  const input = document.getElementById('sarahTextInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  highlightSpeaker('panelSarah');

  // Translate Sarah's English to Tamil for Anand
  let tamilTranslation = text;
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, source_lang: 'en', target_lang: 'ta' })
    });
    const data = await res.json();
    tamilTranslation = data.translated_text || text;
  } catch (e) {}

  // 1. Update Anand's audio output (Anand hears synthesized Tamil voice)
  updateAnandAudioOutput(`Heard: "${tamilTranslation}"`);
  playNeuralVoice(tamilTranslation, 'ta');

  // 2. Sarah's screen confirms her message
  updateSarahScreen("You (Sarah)", text);

  // 3. Add to canonical transcript
  addTranscriptRow("Sarah (Deaf Communicator)", text, tamilTranslation, "Typed Captions");
}

// =========================================================================
// 3. LIAM ACTIONS (Non-Verbal / AAC)
// =========================================================================

function triggerLiamAAC(phrase) {
  commitLiamSpeech(phrase, true);
}

function sendLiamText() {
  const input = document.getElementById('liamTextInput');
  const text = input.value.trim();
  if (!text) return;
  commitLiamSpeech(text, false);
  input.value = '';
}

async function commitLiamSpeech(englishText, isAAC) {
  highlightSpeaker('panelLiam');

  // Translate Liam's English to Tamil for Anand
  let tamilTranslation = englishText;
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: englishText, source_lang: 'en', target_lang: 'ta' })
    });
    const data = await res.json();
    tamilTranslation = data.translated_text || englishText;
  } catch (e) {}

  // 1. Update Sarah's live captions screen in English
  updateSarahScreen("Liam (Non-Verbal AAC)", englishText);

  // 2. Play synthesized Tamil voice for Anand
  updateAnandAudioOutput(`Heard from Liam: "${tamilTranslation}"`);
  playNeuralVoice(tamilTranslation, 'ta');

  // 3. Add to canonical transcript
  addTranscriptRow("Liam (Non-Verbal AAC)", englishText, tamilTranslation, isAAC ? "1-Click AAC" : "Typed Voice");
}

// =========================================================================
// SYNCHRONIZED HELPERS & TRANSCRIPT
// =========================================================================

function updateAnandAudioOutput(displayText) {
  const textEl = document.getElementById('anandAudioText');
  const soundBars = document.getElementById('anandAudioIndicator');
  if (textEl) textEl.textContent = displayText;
  if (soundBars) {
    soundBars.classList.remove('hidden');
    setTimeout(() => soundBars.classList.add('hidden'), 2800);
  }
}

function playNeuralVoice(text, lang) {
  fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, language: lang })
  })
  .then(r => r.json())
  .then(data => {
    if (data.audio_data) audioPlayer.playAudio(data.audio_data);
  })
  .catch(() => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'ta' ? 'ta-IN' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  });
}

function addTranscriptRow(sender, original, translated, modality) {
  const list = document.getElementById('transcriptList');
  if (!list) return;

  const seq = state.seqCount++;
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const row = document.createElement('div');
  row.className = "chat-row space-y-1 shadow-xs";

  let senderColor = "#C85A32";
  if (sender.includes("Sarah")) senderColor = "#2E7D32";
  if (sender.includes("Liam")) senderColor = "#B45309";

  row.innerHTML = `
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center space-x-2">
        <span class="px-1.5 py-0.5 rounded bg-[#F5EFE8] text-[10px] font-bold text-[#5C5248]">#${seq}</span>
        <span class="font-bold" style="color: ${senderColor}">${escapeHtml(sender)}</span>
        <span class="text-[10px] text-[#8A7E73]">(${modality})</span>
      </div>
      <span class="text-[10px] text-[#8A7E73]">${timeStr}</span>
    </div>
    <div class="text-xs text-[#1C1815] pl-6 space-y-0.5">
      <div><strong>Original:</strong> "${escapeHtml(original)}"</div>
      <div class="text-[#5C5248]"><strong>Cross-Translation:</strong> "${escapeHtml(translated)}"</div>
    </div>
  `;

  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

function highlightSpeaker(panelId) {
  ['panelAnand', 'panelSarah', 'panelLiam'].forEach(id => {
    document.getElementById(id)?.classList.remove('is-active-speaker');
  });
  document.getElementById(panelId)?.classList.add('is-active-speaker');
}

function showBargeInAlert() {
  const banner = document.getElementById('interruptionBanner');
  if (banner) {
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 2500);
  }
}

// --- Automated 3-Way Scenario Demonstration (For Judges) ---
function runAuto3WayDemo() {
  audioPlayer.stop();

  const steps = [
    {
      speaker: "Anand (Tamil Speaker)",
      panel: "panelAnand",
      text: "வணக்கம், நாம் இன்றைய கலந்துரையாடலை தொடங்கலாமா?",
      english: "Hello, shall we begin today's discussion?",
      delay: 500,
      action: () => {
        highlightSpeaker('panelAnand');
        updateSarahScreen("Anand (Tamil Speaker)", "Hello, shall we begin today's discussion?");
        addTranscriptRow("Anand (Tamil Speaker)", "வணக்கம், நாம் இன்றைய கலந்துரையாடலை தொடங்கலாமா?", "Hello, shall we begin today's discussion?", "Voice Mic");
      }
    },
    {
      speaker: "Sarah (Deaf Communicator)",
      panel: "panelSarah",
      text: "I can read your speech clearly on my English captions screen.",
      tamil: "உங்கள் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது.",
      delay: 3500,
      action: () => {
        highlightSpeaker('panelSarah');
        updateSarahScreen("You (Sarah)", "I can read your speech clearly on my English captions screen.");
        updateAnandAudioOutput('Heard: "உங்கள் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது."');
        playNeuralVoice("உங்கள் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது.", "ta");
        addTranscriptRow("Sarah (Deaf Communicator)", "I can read your speech clearly on my English captions screen.", "உங்கள் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது.", "Typed Captions");
      }
    },
    {
      speaker: "Liam (Non-Verbal AAC)",
      panel: "panelLiam",
      text: "I am typing via the AAC soundboard, and you hear it as spoken voice.",
      tamil: "நான் ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்.",
      delay: 7000,
      action: () => {
        highlightSpeaker('panelLiam');
        updateSarahScreen("Liam (Non-Verbal AAC)", "I am typing via the AAC soundboard, and you hear it as spoken voice.");
        updateAnandAudioOutput('Heard from Liam: "நான் ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்."');
        playNeuralVoice("நான் ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்.", "ta");
        addTranscriptRow("Liam (Non-Verbal AAC)", "I am typing via the AAC soundboard, and you hear it as spoken voice.", "நான் ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்.", "1-Click AAC");
      }
    },
    {
      speaker: "Anand (Barge-in Interruption)",
      panel: "panelAnand",
      text: "சரியாக சொன்னீர்கள், குறுக்கீடுகள் வந்தாலும் நமது உரையாடல் தடையின்றி நடக்கிறது!",
      english: "Exactly right, even when interruptions occur our conversation continues seamlessly!",
      delay: 10500,
      action: () => {
        audioPlayer.stop();
        showBargeInAlert();
        highlightSpeaker('panelAnand');
        updateSarahScreen("Anand (Barge-in Interruption)", "Exactly right, even when interruptions occur our conversation continues seamlessly!");
        addTranscriptRow("Anand (Barge-in Interruption)", "சரியாக சொன்னீர்கள், குறுக்கீடுகள் வந்தாலும் நமது உரையாடல் தடையின்றி நடக்கிறது!", "Exactly right, even when interruptions occur our conversation continues seamlessly!", "Voice Mic");
      }
    }
  ];

  steps.forEach(step => setTimeout(step.action, step.delay));
}

// Accessibility toggles
function toggleHighContrast() {
  state.isHighContrast = !state.isHighContrast;
  const screen = document.getElementById('sarahCaptionsScreen');
  if (state.isHighContrast) screen.classList.add('high-contrast');
  else screen.classList.remove('high-contrast');
}

function adjustCaptionSize(delta) {
  state.captionSize = Math.max(12, Math.min(28, state.captionSize + delta * 2));
  const el = document.getElementById('sarahSubtitlesText');
  if (el) el.style.fontSize = `${state.captionSize}px`;
}

function toggleAudioMute() {
  state.isAudioMuted = !state.isAudioMuted;
  const icon = document.getElementById('muteIcon');
  if (state.isAudioMuted) {
    audioPlayer.stop();
    icon.setAttribute('data-lucide', 'volume-x');
  } else {
    icon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  lucide.createIcons();

  document.getElementById('anandTextInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAnandText();
  });
  document.getElementById('sarahTextInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSarahText();
  });
  document.getElementById('liamTextInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendLiamText();
  });
});
