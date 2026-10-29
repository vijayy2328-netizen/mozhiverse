/**
 * Mozhiverse - Real-Time Multimodal Communication Engine
 * Supporting Qwen 2.5 Multilingual AI, Continuous Voice Listening,
 * Canonical Turn Sequencing, Interruption Handling, and Streaming TTS.
 */

// Application State
const state = {
  clientId: 'user_' + Math.random().toString(36).substring(2, 9),
  roomId: 'live-conference',
  activeLanguage: 'en',
  isContinuousListening: false,
  isAudioMuted: false,
  isHighContrast: false,
  captionSize: 24,
  websocket: null,
  recognition: null,
  outboxQueue: [],
  currentSpeaker: null
};

// --- Streaming Audio Queue with Interruption Support ---
class StreamingAudioPlayer {
  constructor() {
    this.queue = [];
    this.isPlaying = false;
    this.currentAudio = null;
  }

  enqueue(audioDataUri) {
    if (state.isAudioMuted || !audioDataUri) return;
    this.queue.push(audioDataUri);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentAudio = null;
      document.getElementById('liveSoundIndicator')?.classList.add('hidden');
      return;
    }

    this.isPlaying = true;
    document.getElementById('liveSoundIndicator')?.classList.remove('hidden');

    const nextAudioUri = this.queue.shift();
    const audio = new Audio(nextAudioUri);
    this.currentAudio = audio;

    audio.onended = () => {
      this.playNext();
    };

    audio.onerror = (e) => {
      console.warn("Audio playback chunk error:", e);
      this.playNext();
    };

    audio.play().catch((err) => {
      console.warn("Autoplay was prevented by browser:", err);
      this.playNext();
    });
  }

  stopAndCancel(triggerBargeInAlert = false) {
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
    document.getElementById('liveSoundIndicator')?.classList.add('hidden');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (triggerBargeInAlert) {
      const alertBadge = document.getElementById('interruptionAlert');
      if (alertBadge) {
        alertBadge.classList.remove('hidden');
        setTimeout(() => alertBadge.classList.add('hidden'), 2200);
      }
    }
  }
}

const audioPlayer = new StreamingAudioPlayer();

// --- WebSocket Connection & Network Resilience ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/room/${state.roomId}/${state.clientId}`;

  const ws = new WebSocket(wsUrl);
  state.websocket = ws;

  ws.onopen = () => {
    updateConnectionStatus(true);
    // Register participant
    ws.send(JSON.stringify({
      type: 'register',
      name: 'Local Participant',
      language: state.activeLanguage,
      input_modality: 'both',
      output_modality: 'both',
      avatar: 'user'
    }));

    // Flush outbox queue if network recovered
    while (state.outboxQueue.length > 0) {
      const pendingMsg = state.outboxQueue.shift();
      ws.send(JSON.stringify(pendingMsg));
    }
  };

  ws.onclose = () => {
    updateConnectionStatus(false);
    setTimeout(initWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket connection error:", err);
    updateConnectionStatus(false);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleIncomingMessage(data);
    } catch (e) {
      console.error("Error parsing message payload:", e);
    }
  };
}

function updateConnectionStatus(isConnected) {
  const indicator = document.getElementById('connectionStatusIndicator');
  if (!indicator) return;
  if (isConnected) {
    indicator.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-[#2E7D32]"></span>
      <span>Connected (Real-time)</span>
    `;
    indicator.className = "inline-flex items-center space-x-1.5 text-[#2E7D32] font-medium";
  } else {
    indicator.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-[#C53030]"></span>
      <span>Reconnecting...</span>
    `;
    indicator.className = "inline-flex items-center space-x-1.5 text-[#C53030] font-medium";
  }
}

// --- Message Router ---
function handleIncomingMessage(msg) {
  const mtype = msg.type;

  if (mtype === 'welcome') {
    if (msg.transcript) {
      msg.transcript.forEach(addTranscriptEntry);
    }
  }

  else if (mtype === 'interim_speech') {
    // Real-time interim speech streaming (partial words as they are spoken)
    displayCaptions(msg.sender_name || 'Speaker', msg.text, msg.sender_lang, false);
    highlightParticipantTile(msg.sender_name);
  }

  else if (mtype === 'message') {
    // Finalized statement
    displayCaptions(msg.sender_name || 'Speaker', msg.display_text || msg.original_text, msg.recipient_lang || msg.sender_lang, true);
    addTranscriptEntry(msg);
    highlightParticipantTile(msg.sender_name);

    // If audio is meant to be played
    if (msg.should_play_audio && !state.isAudioMuted && msg.sender_id !== state.clientId) {
      fetchNeuralTTS(msg.display_text || msg.original_text, msg.recipient_lang);
    }
  }

  else if (mtype === 'live_audio_chunk') {
    // Real-time streaming audio chunk: plays immediately without waiting for full sentence
    if (msg.audio_data && msg.sender_id !== state.clientId) {
      audioPlayer.enqueue(msg.audio_data);
    }
    displayCaptions(msg.sender_name || 'Speaking', msg.text, 'live', false);
  }

  else if (mtype === 'cancel_audio') {
    // Barge-in interruption: cancel obsolete audio
    audioPlayer.stopAndCancel(true);
  }
}

// --- Live Captions Display ---
function displayCaptions(speakerName, text, lang, isFinal) {
  const captionEl = document.getElementById('liveCaptionText');
  const speakerBadge = document.getElementById('speakerNameText');
  const langBadge = document.getElementById('speakerLanguageBadge');
  const soundBars = document.getElementById('liveSoundIndicator');

  speakerBadge.textContent = speakerName || 'Live Audio Stream';
  langBadge.textContent = lang ? lang.toUpperCase() : 'LIVE';

  if (!isFinal) {
    captionEl.innerHTML = `<span class="caption-highlight">${escapeHtml(text)}</span> <span class="animate-pulse">|</span>`;
    soundBars.classList.remove('hidden');
  } else {
    captionEl.innerHTML = escapeHtml(text);
    setTimeout(() => {
      soundBars.classList.add('hidden');
    }, 1400);
  }
}

// --- Canonical Transcript Log ---
function addTranscriptEntry(msg) {
  const list = document.getElementById('transcriptList');
  if (!list) return;

  const item = document.createElement('div');
  item.className = "p-3 bg-white rounded-xl border border-[#E8E2D8] space-y-1 shadow-xs transition hover:border-[#D8D0C3]";

  const isSelf = msg.sender_id === state.clientId;
  const senderColor = isSelf ? "text-[#C85A32]" : "text-[#1F1916]";
  const timeStr = new Date(msg.timestamp ? msg.timestamp * 1000 : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const seqLabel = msg.seq_id ? `#${msg.seq_id}` : '#1';

  const displayText = msg.display_text || msg.original_text || msg.text || '';
  const modality = msg.input_modality === 'speech' ? 'Spoken Voice' : (msg.is_aac ? '1-Click Soundboard' : 'Typed Text');

  item.innerHTML = `
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center space-x-2">
        <span class="px-1.5 py-0.5 rounded bg-[#F3EFEA] text-[10px] font-bold text-[#5C5249]">${seqLabel}</span>
        <span class="font-bold ${senderColor}">${escapeHtml(msg.sender_name || (isSelf ? 'You' : 'Speaker'))}</span>
        <span class="text-[10px] text-[#8C8074]">(${modality})</span>
      </div>
      <div class="text-[11px] text-[#8C8074]">
        ${timeStr}
      </div>
    </div>
    <div class="text-xs text-[#1F1916] font-normal leading-relaxed pl-6">
      ${escapeHtml(displayText)}
    </div>
  `;

  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// --- Active Participant Tile Highlighter ---
function highlightParticipantTile(name) {
  ['tileAnand', 'tileSarah', 'tileLiam'].forEach(id => {
    document.getElementById(id)?.classList.remove('active-turn');
  });

  if (!name) return;
  const lower = name.toLowerCase();
  if (lower.includes('anand')) {
    document.getElementById('tileAnand')?.classList.add('active-turn');
  } else if (lower.includes('sarah')) {
    document.getElementById('tileSarah')?.classList.add('active-turn');
  } else if (lower.includes('liam')) {
    document.getElementById('tileLiam')?.classList.add('active-turn');
  }
}

// --- Single-Click Continuous Microphone Toggle ---
function toggleContinuousMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is supported natively in Google Chrome, Microsoft Edge, and Safari.");
    return;
  }

  const micBtn = document.getElementById('continuousMicBtn');
  const headline = document.getElementById('micStatusHeadline');
  const pill = document.getElementById('micStatusPill');

  if (state.isContinuousListening) {
    // Stop continuous listening
    if (state.recognition) {
      state.recognition.stop();
    }
    state.isContinuousListening = false;
    micBtn.classList.remove('is-active');
    headline.textContent = "Click Circular Button to Talk";
    pill.textContent = "Single-Click Continuous";
    pill.className = "text-[11px] px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#5C5249] font-medium";
    return;
  }

  // Start continuous listening
  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.activeLanguage === 'ta' ? 'ta-IN' : (state.activeLanguage === 'hi' ? 'hi-IN' : 'en-US');

    recognition.onstart = () => {
      state.isContinuousListening = true;
      micBtn.classList.add('is-active');
      headline.textContent = "Listening Live (Speak in any language)...";
      pill.textContent = "Live Active";
      pill.className = "text-[11px] px-2 py-0.5 rounded-full bg-[#FDF3ED] text-[#C85A32] font-semibold border border-[#F5D3C4]";
    };

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
        dispatchMessage({
          type: 'interim_speech',
          turn_id: 'turn_live',
          text: interim
        });
      }

      if (finalized) {
        dispatchMessage({
          type: 'message',
          text: finalized,
          input_modality: 'speech'
        });
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition warning:", e.error);
    };

    recognition.onend = () => {
      // Auto-restart if user still wants continuous listening
      if (state.isContinuousListening) {
        try { recognition.start(); } catch (err) {}
      } else {
        micBtn.classList.remove('is-active');
        headline.textContent = "Click Circular Button to Talk";
        pill.textContent = "Single-Click Continuous";
        pill.className = "text-[11px] px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#5C5249] font-medium";
      }
    };

    recognition.start();
    state.recognition = recognition;
  } catch (err) {
    console.error("Speech recognition startup error:", err);
  }
}

// --- Outbox Queue & Safe Dispatcher ---
function dispatchMessage(payload) {
  if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
    state.websocket.send(JSON.stringify(payload));
  } else {
    // Save to local outbox queue if network drops
    state.outboxQueue.push(payload);
  }
}

// --- Direct Text Typing for Non-Verbal Participants ---
function sendTypedText() {
  const input = document.getElementById('textInputComposer');
  const text = input.value.trim();
  if (!text) return;

  dispatchMessage({
    type: 'message',
    text: text,
    input_modality: 'text'
  });

  input.value = '';
}

// --- 1-Click Assistive Soundboard ---
function triggerSoundboard(phrase) {
  dispatchMessage({
    type: 'message',
    text: phrase,
    input_modality: 'aac',
    is_aac: true
  });
}

// --- Neural TTS Synthesis Helper ---
function fetchNeuralTTS(text, lang) {
  fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, language: lang || state.activeLanguage })
  })
  .then(res => res.json())
  .then(data => {
    if (data.audio_data) {
      audioPlayer.enqueue(data.audio_data);
    }
  })
  .catch(() => {
    // Fallback to browser Web Speech API if server TTS is unreachable
    if ('speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = lang === 'ta' ? 'ta-IN' : 'en-US';
      window.speechSynthesis.speak(utt);
    }
  });
}

// --- Auto 3-Way Scenario Demonstration (For Judges) ---
function runAuto3WayDemo() {
  audioPlayer.stopAndCancel(false);

  const scenario = [
    {
      speaker: 'Anand (Tamil Speaker)',
      roleId: 'tileAnand',
      text: 'வணக்கம், நாம் இன்றைய கலந்துரையாடலை தொடங்கலாமா?',
      translated: 'Hello, shall we begin today\'s discussion?',
      lang: 'ta',
      targetLang: 'en',
      delay: 500,
      modality: 'speech'
    },
    {
      speaker: 'Sarah (Deaf Communicator)',
      roleId: 'tileSarah',
      text: 'I can read your Tamil speech clearly on my English captions screen.',
      translated: 'உங்கள் தமிழ் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது.',
      lang: 'en',
      targetLang: 'ta',
      delay: 3400,
      modality: 'captions'
    },
    {
      speaker: 'Liam (Non-Verbal AAC)',
      roleId: 'tileLiam',
      text: 'I am typing this via the soundboard, and you are hearing it as spoken voice.',
      translated: 'நான் இதை ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்.',
      lang: 'en',
      targetLang: 'ta',
      delay: 6600,
      modality: 'aac'
    },
    {
      speaker: 'Anand (Interruption / Barge-in)',
      roleId: 'tileAnand',
      text: 'சரியாக சொன்னீர்கள், குறுக்கீடுகள் வந்தாலும் நமது உரையாடல் தடையின்றி நடக்கிறது!',
      translated: 'Exactly right, even when interruptions occur our conversation continues seamlessly!',
      lang: 'ta',
      targetLang: 'en',
      delay: 9600,
      modality: 'speech',
      isBargeIn: true
    }
  ];

  scenario.forEach((step, idx) => {
    setTimeout(() => {
      highlightParticipantTile(step.speaker);

      if (step.isBargeIn) {
        audioPlayer.stopAndCancel(true);
      }

      displayCaptions(step.speaker, step.translated, step.targetLang, true);

      addTranscriptEntry({
        seq_id: idx + 1,
        sender_id: 'demo_' + step.roleId,
        sender_name: step.speaker,
        original_text: step.text,
        display_text: `${step.text} → [${step.targetLang.toUpperCase()}]: ${step.translated}`,
        input_modality: step.modality,
        timestamp: Date.now() / 1000
      });

      // Play synthesized audio for listeners
      if (!state.isAudioMuted && step.roleId !== 'tileSarah') {
        fetchNeuralTTS(step.translated, step.targetLang);
      }
    }, step.delay);
  });
}

// --- Settings & Accessibility Functions ---
function changeLanguage(lang) {
  state.activeLanguage = lang;
  if (state.recognition) {
    state.recognition.lang = lang === 'ta' ? 'ta-IN' : (lang === 'hi' ? 'hi-IN' : 'en-US');
  }
}

function toggleHighContrast() {
  state.isHighContrast = !state.isHighContrast;
  const container = document.getElementById('captionContainer');
  if (state.isHighContrast) {
    container.classList.add('high-contrast');
  } else {
    container.classList.remove('high-contrast');
  }
}

function adjustCaptionSize(delta) {
  state.captionSize = Math.max(16, Math.min(44, state.captionSize + delta * 3));
  const captionEl = document.getElementById('liveCaptionText');
  captionEl.style.fontSize = `${state.captionSize}px`;
}

function toggleAudioMute() {
  state.isAudioMuted = !state.isAudioMuted;
  const icon = document.getElementById('muteIcon');
  if (state.isAudioMuted) {
    audioPlayer.stopAndCancel(false);
    icon.setAttribute('data-lucide', 'volume-x');
  } else {
    icon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  lucide.createIcons();

  // Check Multilingual Model Status
  fetch('/api/qwen/status')
    .then(r => r.json())
    .then(status => {
      const statusText = document.getElementById('modelStatusText');
      if (statusText) {
        statusText.textContent = `${status.engine || 'Qwen 2.5'}: Active`;
      }
    })
    .catch(() => {});

  // Enter key support for text input
  document.getElementById('textInputComposer')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendTypedText();
    }
  });
});
