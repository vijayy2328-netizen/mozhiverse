/**
 * Mozhiverse - Accessible Live Voice & Caption Bridge Engine
 * Ultra-simple, single-screen UI controller
 */

const state = {
  clientId: 'user_' + Math.random().toString(36).substring(2, 9),
  roomId: 'live-conference',
  activeLanguage: 'en',
  activeRole: 'anand', // 'anand' | 'sarah' | 'liam'
  isContinuousListening: false,
  isAudioMuted: false,
  isHighContrast: false,
  captionSize: 24,
  websocket: null,
  recognition: null,
  outboxQueue: []
};

// --- Gapless Streaming Audio Player ---
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

    audio.onended = () => this.playNext();
    audio.onerror = () => this.playNext();
    audio.play().catch(() => this.playNext());
  }

  stopAndCancel(showBargeInAlert = false) {
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

    if (showBargeInAlert) {
      const alertBadge = document.getElementById('interruptionAlert');
      if (alertBadge) {
        alertBadge.classList.remove('hidden');
        setTimeout(() => alertBadge.classList.add('hidden'), 2200);
      }
    }
  }
}

const audioPlayer = new StreamingAudioPlayer();

// --- WebSocket Connection ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/room/${state.roomId}/${state.clientId}`;

  const ws = new WebSocket(wsUrl);
  state.websocket = ws;

  ws.onopen = () => {
    // Handshake
    ws.send(JSON.stringify({
      type: 'register',
      name: getRoleName(state.activeRole),
      language: state.activeLanguage,
      input_modality: 'both',
      output_modality: 'both'
    }));

    // Flush offline messages
    while (state.outboxQueue.length > 0) {
      ws.send(JSON.stringify(state.outboxQueue.shift()));
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error("Parse error:", e);
    }
  };
}

function handleMessage(msg) {
  const mtype = msg.type;

  if (mtype === 'welcome') {
    if (msg.transcript) {
      msg.transcript.forEach(addTranscriptBubble);
    }
  }

  else if (mtype === 'interim_speech') {
    // Real-time live speech hypotheses (shows words as they are being spoken)
    displayCaptions(msg.sender_name || 'Speaker', msg.text, msg.sender_lang, false);
  }

  else if (mtype === 'message') {
    // Finalized message
    displayCaptions(msg.sender_name || 'Speaker', msg.display_text || msg.original_text, msg.recipient_lang || msg.sender_lang, true);
    addTranscriptBubble(msg);

    if (msg.should_play_audio && !state.isAudioMuted && msg.sender_id !== state.clientId) {
      fetchNeuralAudio(msg.display_text || msg.original_text, msg.recipient_lang);
    }
  }

  else if (mtype === 'live_audio_chunk') {
    // Low-latency streaming clause audio: plays immediately
    if (msg.audio_data && msg.sender_id !== state.clientId) {
      audioPlayer.enqueue(msg.audio_data);
    }
    displayCaptions(msg.sender_name || 'Speaking', msg.text, 'live', false);
  }

  else if (mtype === 'cancel_audio') {
    audioPlayer.stopAndCancel(true);
  }
}

// --- Live Captions Display ---
function displayCaptions(speakerName, text, lang, isFinal) {
  const captionEl = document.getElementById('liveCaptionText');
  const speakerBadge = document.getElementById('speakerNameText');
  const langBadge = document.getElementById('speakerLanguageBadge');
  const soundBars = document.getElementById('liveSoundIndicator');

  speakerBadge.textContent = speakerName || 'Live Audio';
  langBadge.textContent = lang ? lang.toUpperCase() : 'LIVE';

  if (!isFinal) {
    captionEl.innerHTML = `<span class="caption-highlight">${escapeHtml(text)}</span> <span class="animate-pulse">|</span>`;
    soundBars.classList.remove('hidden');
  } else {
    captionEl.innerHTML = escapeHtml(text);
    setTimeout(() => soundBars.classList.add('hidden'), 1200);
  }
}

// --- Transcript Chat Bubble ---
function addTranscriptBubble(msg) {
  const list = document.getElementById('transcriptList');
  if (!list) return;

  const item = document.createElement('div');
  item.className = "chat-bubble space-y-1 shadow-xs";

  const isSelf = msg.sender_id === state.clientId;
  const senderColor = isSelf ? "text-[#C85A32]" : "text-[#1C1815]";
  const timeStr = new Date(msg.timestamp ? msg.timestamp * 1000 : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const seqLabel = msg.seq_id ? `#${msg.seq_id}` : '#1';
  const modality = msg.input_modality === 'speech' ? 'Voice Mic' : (msg.is_aac ? '1-Click Voice' : 'Typed Text');

  item.innerHTML = `
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center space-x-2">
        <span class="px-1.5 py-0.5 rounded bg-[#F5EFE8] text-[10px] font-bold text-[#5C5248]">${seqLabel}</span>
        <span class="font-bold ${senderColor}">${escapeHtml(msg.sender_name || (isSelf ? 'You' : 'Speaker'))}</span>
        <span class="text-[10px] text-[#8A7E73]">(${modality})</span>
      </div>
      <div class="text-[10px] text-[#8A7E73]">${timeStr}</div>
    </div>
    <div class="text-xs text-[#1C1815] font-normal leading-relaxed pl-6">
      ${escapeHtml(msg.display_text || msg.original_text || msg.text || '')}
    </div>
  `;

  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// --- Continuous Microphone (Single Click, No Holding) ---
function toggleContinuousMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Voice speech recognition is supported natively in Chrome, Edge, and Safari.");
    return;
  }

  const btn = document.getElementById('continuousMicBtn');
  const label = document.getElementById('micButtonText');

  if (state.isContinuousListening) {
    // Stop
    if (state.recognition) state.recognition.stop();
    state.isContinuousListening = false;
    btn.classList.remove('is-active');
    label.textContent = "Click to Speak (Live Mic)";
    return;
  }

  // Start
  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.activeLanguage === 'ta' ? 'ta-IN' : (state.activeLanguage === 'hi' ? 'hi-IN' : 'en-US');

    recognition.onstart = () => {
      state.isContinuousListening = true;
      btn.classList.add('is-active');
      label.textContent = "Listening Live (Click to Stop)";
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
        dispatch({
          type: 'interim_speech',
          turn_id: 'turn_live',
          text: interim
        });
      }

      if (finalized) {
        dispatch({
          type: 'message',
          text: finalized,
          input_modality: 'speech'
        });
      }
    };

    recognition.onerror = (e) => console.warn("Recognition:", e.error);

    recognition.onend = () => {
      if (state.isContinuousListening) {
        try { recognition.start(); } catch (err) {}
      } else {
        btn.classList.remove('is-active');
        label.textContent = "Click to Speak (Live Mic)";
      }
    };

    recognition.start();
    state.recognition = recognition;
  } catch (err) {
    console.error("Recognition start error:", err);
  }
}

function dispatch(payload) {
  if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
    state.websocket.send(JSON.stringify(payload));
  } else {
    state.outboxQueue.push(payload);
  }
}

// --- Text-to-Speech Typing ---
function sendTypedText() {
  const input = document.getElementById('textInputComposer');
  const text = input.value.trim();
  if (!text) return;

  dispatch({
    type: 'message',
    text: text,
    input_modality: 'text'
  });

  input.value = '';
}

// --- 1-Click Assistive Soundboard ---
function triggerSoundboard(phrase) {
  dispatch({
    type: 'message',
    text: phrase,
    input_modality: 'aac',
    is_aac: true
  });
}

// --- Neural Audio Synthesis ---
function fetchNeuralAudio(text, lang) {
  fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, language: lang || state.activeLanguage })
  })
  .then(res => res.json())
  .then(data => {
    if (data.audio_data) audioPlayer.enqueue(data.audio_data);
  })
  .catch(() => {
    if ('speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = lang === 'ta' ? 'ta-IN' : 'en-US';
      window.speechSynthesis.speak(utt);
    }
  });
}

// --- Role Switcher (Anand / Sarah / Liam) ---
function switchUserRole(role) {
  state.activeRole = role;
  ['tabAnand', 'tabSarah', 'tabLiam'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });

  const activeTab = role === 'anand' ? 'tabAnand' : (role === 'sarah' ? 'tabSarah' : 'tabLiam');
  document.getElementById(activeTab)?.classList.add('active');

  const langSelect = document.getElementById('activeLanguageSelect');
  if (role === 'anand') {
    state.activeLanguage = 'ta';
    langSelect.value = 'ta';
  } else {
    state.activeLanguage = 'en';
    langSelect.value = 'en';
  }

  changeLanguage(state.activeLanguage);
}

function getRoleName(role) {
  if (role === 'anand') return 'Anand (Tamil Speaker)';
  if (role === 'sarah') return 'Sarah (Deaf Captions)';
  return 'Liam (Non-Verbal AAC)';
}

function changeLanguage(lang) {
  state.activeLanguage = lang;
  if (state.recognition) {
    state.recognition.lang = lang === 'ta' ? 'ta-IN' : (lang === 'hi' ? 'hi-IN' : 'en-US');
  }
}

// --- Auto 3-Way Scenario Demonstration (For Judges) ---
function runAuto3WayDemo() {
  audioPlayer.stopAndCancel(false);

  const scenario = [
    {
      speaker: 'Anand (Tamil Speaker)',
      role: 'anand',
      text: 'வணக்கம், நாம் இன்றைய கலந்துரையாடலை தொடங்கலாமா?',
      translated: 'Hello, shall we begin today\'s discussion?',
      lang: 'ta',
      targetLang: 'en',
      delay: 500,
      modality: 'speech'
    },
    {
      speaker: 'Sarah (Deaf Communicator)',
      role: 'sarah',
      text: 'I can read your Tamil speech clearly on my English captions screen.',
      translated: 'உங்கள் தமிழ் பேச்சை எனது ஆங்கில தலைப்புகளில் தெளிவாக படிக்க முடிகிறது.',
      lang: 'en',
      targetLang: 'ta',
      delay: 3400,
      modality: 'captions'
    },
    {
      speaker: 'Liam (Non-Verbal AAC)',
      role: 'liam',
      text: 'I am typing this via the soundboard, and you are hearing it as spoken voice.',
      translated: 'நான் இதை ஒலி பலகை மூலம் தட்டச்சு செய்கிறேன், அதை நீங்கள் பேசும் குரலாகக் கேட்கிறீர்கள்.',
      lang: 'en',
      targetLang: 'ta',
      delay: 6600,
      modality: 'aac'
    },
    {
      speaker: 'Anand (Barge-In Interruption)',
      role: 'anand',
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
      switchUserRole(step.role);

      if (step.isBargeIn) {
        audioPlayer.stopAndCancel(true);
      }

      displayCaptions(step.speaker, step.translated, step.targetLang, true);

      addTranscriptBubble({
        seq_id: idx + 1,
        sender_id: 'demo_' + step.role,
        sender_name: step.speaker,
        original_text: step.text,
        display_text: `${step.text} → [${step.targetLang.toUpperCase()}]: ${step.translated}`,
        input_modality: step.modality,
        timestamp: Date.now() / 1000
      });

      if (!state.isAudioMuted && step.role !== 'sarah') {
        fetchNeuralAudio(step.translated, step.targetLang);
      }
    }, step.delay);
  });
}

// Accessibility toggles
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
  state.captionSize = Math.max(16, Math.min(42, state.captionSize + delta * 3));
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

window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  lucide.createIcons();

  document.getElementById('textInputComposer')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTypedText();
  });
});
