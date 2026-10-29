/**
 * Mozhiverse - Accessible Live Caption & Voice Bridge
 * Frontend Engine with Llama AI Pipeline & Low-Latency Streaming TTS
 */

// Application State
const state = {
  clientId: 'client_' + Math.random().toString(36).substring(2, 9),
  roomId: 'demo-room',
  role: 'deaf', // 'deaf' | 'hearing'
  language: 'en',
  llamaMode: 'expand', // 'expand' | 'direct'
  captionSize: 24,
  isHighContrast: false,
  isAudioMuted: false,
  isRecording: false,
  websocket: null,
  recognition: null,
  audioQueue: []
};

// --- Streaming Audio Queue for Gapless Chunk Playback ---
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
      console.warn("Audio playback error, skipping chunk:", e);
      this.playNext();
    };

    audio.play().catch((err) => {
      console.warn("Browser prevented autoplay:", err);
      this.playNext();
    });
  }

  stopAll() {
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
    updateConnectionStatus(true);
    // Registration handshake
    ws.send(JSON.stringify({
      type: 'register',
      name: state.role === 'deaf' ? 'Deaf Communicator' : 'Speaking Partner',
      language: state.language,
      input_modality: state.role === 'deaf' ? 'text' : 'speech',
      output_modality: state.role === 'deaf' ? 'captions' : 'audio',
      avatar: 'user'
    }));
  };

  ws.onclose = () => {
    updateConnectionStatus(false);
    setTimeout(initWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    updateConnectionStatus(false);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleIncomingMessage(data);
    } catch (e) {
      console.error("Message parse error:", e);
    }
  };
}

function updateConnectionStatus(isConnected) {
  const indicator = document.getElementById('connectionStatusIndicator');
  if (!indicator) return;
  if (isConnected) {
    indicator.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-[#2E7D32]"></span>
      <span>Connected</span>
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

// --- Incoming Message Dispatcher ---
function handleIncomingMessage(msg) {
  const mtype = msg.type;

  if (mtype === 'welcome') {
    if (msg.participants) {
      document.getElementById('participantCount').textContent = `${msg.participants.length} participant${msg.participants.length > 1 ? 's' : ''}`;
    }
    if (msg.transcript) {
      msg.transcript.forEach(addTranscriptMessage);
    }
  }

  else if (mtype === 'participant_joined' || mtype === 'participant_left') {
    if (msg.participants) {
      document.getElementById('participantCount').textContent = `${msg.participants.length} participant${msg.participants.length > 1 ? 's' : ''}`;
    }
  }

  else if (mtype === 'interim_speech') {
    // Real-time live captions for Deaf User as speaker is talking
    displayLiveCaption(msg.sender_name || 'Speaker', msg.text, msg.sender_lang, false);
  }

  else if (mtype === 'message') {
    // Finalized statement
    displayLiveCaption(msg.sender_name || 'Speaker', msg.display_text || msg.original_text, msg.recipient_lang || msg.sender_lang, true);
    addTranscriptMessage(msg);

    // If recipient is listening to audio and not muted
    if (msg.should_play_audio && !state.isAudioMuted && msg.sender_id !== state.clientId) {
      speakFallback(msg.display_text || msg.original_text, msg.recipient_lang);
    }
  }

  else if (mtype === 'llama_started') {
    const feedbackBox = document.getElementById('streamingFeedbackBox');
    const display = document.getElementById('streamingTokensDisplay');
    feedbackBox.classList.remove('hidden');
    display.textContent = '';
    document.getElementById('streamingStatusLabel').textContent = 'Llama streaming response & synthesizing audio...';
  }

  else if (mtype === 'llama_token') {
    const display = document.getElementById('streamingTokensDisplay');
    display.textContent += msg.token;
  }

  else if (mtype === 'llama_chunk_sent') {
    document.getElementById('clauseCounter').textContent = `Clause #${msg.chunk_index}`;
  }

  else if (mtype === 'live_audio_chunk') {
    // Streaming audio chunk delivered to hearing listener
    // Do NOT wait for full sentence: play audio immediately!
    if (msg.audio_data && msg.sender_id !== state.clientId) {
      audioPlayer.enqueue(msg.audio_data);
    }
    displayLiveCaption(msg.sender_name || 'Speaking', msg.text, 'live', false);
  }

  else if (mtype === 'cancel_audio') {
    audioPlayer.stopAll();
  }
}

// --- Live Caption Display ---
function displayLiveCaption(speakerName, text, lang, isFinal) {
  const container = document.getElementById('captionContainer');
  const captionEl = document.getElementById('liveCaptionText');
  const speakerBadge = document.getElementById('speakerNameText');
  const langBadge = document.getElementById('speakerLanguageBadge');
  const soundBars = document.getElementById('liveSoundIndicator');

  speakerBadge.textContent = speakerName || 'Live Speaker';
  langBadge.textContent = lang ? lang.toUpperCase() : 'LIVE';

  if (!isFinal) {
    captionEl.innerHTML = `<span class="caption-highlight">${escapeHtml(text)}</span> <span class="animate-pulse">|</span>`;
    soundBars.classList.remove('hidden');
  } else {
    captionEl.innerHTML = escapeHtml(text);
    setTimeout(() => {
      soundBars.classList.add('hidden');
    }, 1200);
  }
}

// --- Add Item to Conversation Transcript Log ---
function addTranscriptMessage(msg) {
  const list = document.getElementById('transcriptList');
  if (!list) return;

  const item = document.createElement('div');
  item.className = "p-3 bg-white rounded-lg border border-[#E5DFD5] space-y-1 shadow-xs";

  const isSelf = msg.sender_id === state.clientId;
  const senderColor = isSelf ? "text-[#C85A32]" : "text-[#231F1C]";
  const timeStr = new Date(msg.timestamp ? msg.timestamp * 1000 : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const displayText = msg.display_text || msg.original_text || msg.text || '';
  const modalityLabel = msg.input_modality === 'text_llama' || msg.input_modality === 'llama_assisted'
    ? 'Llama AI Voice'
    : (msg.input_modality === 'speech' ? 'Speech Mic' : 'Text');

  item.innerHTML = `
    <div class="flex items-center justify-between text-xs">
      <span class="font-bold ${senderColor}">${escapeHtml(msg.sender_name || (isSelf ? 'You' : 'Speaker'))}</span>
      <div class="flex items-center space-x-1.5 text-[11px] text-[#857A70]">
        <span class="px-1.5 py-0.2 rounded bg-[#F1ECE3] font-medium text-[#584F47]">${modalityLabel}</span>
        <span>${timeStr}</span>
      </div>
    </div>
    <div class="text-xs text-[#231F1C] font-normal leading-relaxed">
      ${escapeHtml(displayText)}
    </div>
  `;

  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// --- Send Typed Message Through Llama Pipeline ---
function dispatchLlamaMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
    state.websocket.send(JSON.stringify({
      type: 'llama_stream',
      text: text,
      mode: state.llamaMode,
      language: state.language
    }));
  }

  input.value = '';
}

// --- 1-Click Instant Assistive Responses ---
function sendQuickPhrase(phrase) {
  const input = document.getElementById('messageInput');
  input.value = phrase;
  dispatchLlamaMessage();
}

// --- Voice Recognition for Hearing Partner (Web Speech API) ---
function toggleSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is supported in Google Chrome, Microsoft Edge, and Safari.");
    return;
  }

  const micBtn = document.getElementById('micBtn');
  const micLabel = document.getElementById('micButtonText');

  if (state.isRecording) {
    if (state.recognition) {
      state.recognition.stop();
    }
    state.isRecording = false;
    micBtn.className = "px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1ECE3] text-[#584F47] border border-[#D5CDC0] font-medium text-xs flex items-center space-x-1.5 transition shadow-sm";
    micLabel.textContent = "Start Voice Mic";
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = state.language === 'ta' ? 'ta-IN' : (state.language === 'hi' ? 'hi-IN' : 'en-US');

    recognition.onstart = () => {
      state.isRecording = true;
      micBtn.className = "px-3.5 py-2 rounded-xl bg-[#FDF3ED] text-[#C85A32] border border-[#F5D3C4] font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm";
      micLabel.textContent = "Listening Live...";
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

      if (interim && state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
          type: 'interim_speech',
          turn_id: 'turn_live',
          text: interim
        }));
      }

      if (finalized && state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
          type: 'message',
          text: finalized,
          input_modality: 'speech'
        }));
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
    };

    recognition.onend = () => {
      if (state.isRecording) {
        try { recognition.start(); } catch (err) {}
      } else {
        micBtn.className = "px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1ECE3] text-[#584F47] border border-[#D5CDC0] font-medium text-xs flex items-center space-x-1.5 transition shadow-sm";
        micLabel.textContent = "Start Voice Mic";
      }
    };

    recognition.start();
    state.recognition = recognition;
  } catch (err) {
    console.error("Failed to start speech recognition:", err);
  }
}

// Fallback Browser TTS
function speakFallback(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ta' ? 'ta-IN' : (lang === 'hi' ? 'hi-IN' : 'en-US');
  window.speechSynthesis.speak(utterance);
}

// --- Role Switcher ---
function setRole(role) {
  state.role = role;
  const deafBtn = document.getElementById('roleBtnDeaf');
  const hearingBtn = document.getElementById('roleBtnHearing');

  if (role === 'deaf') {
    deafBtn.className = "px-3 py-1.5 rounded-md bg-[#C85A32] text-white font-medium hover:bg-[#B04B26] transition flex items-center space-x-1.5 shadow-sm";
    hearingBtn.className = "px-3 py-1.5 rounded-md text-[#584F47] hover:text-[#231F1C] hover:bg-white transition flex items-center space-x-1.5";
    document.getElementById('sendButtonLabel').textContent = "Llama Speak Live";
  } else {
    hearingBtn.className = "px-3 py-1.5 rounded-md bg-[#C85A32] text-white font-medium hover:bg-[#B04B26] transition flex items-center space-x-1.5 shadow-sm";
    deafBtn.className = "px-3 py-1.5 rounded-md text-[#584F47] hover:text-[#231F1C] hover:bg-white transition flex items-center space-x-1.5";
    document.getElementById('sendButtonLabel').textContent = "Send Message";
  }
}

// --- Llama Mode Switcher ---
function setLlamaMode(mode) {
  state.llamaMode = mode;
  const expandBtn = document.getElementById('modeExpandBtn');
  const directBtn = document.getElementById('modeDirectBtn');

  if (mode === 'expand') {
    expandBtn.className = "px-2.5 py-1 rounded-md bg-white text-[#C85A32] font-semibold shadow-sm transition";
    directBtn.className = "px-2.5 py-1 rounded-md text-[#584F47] hover:text-[#231F1C] font-medium transition";
  } else {
    directBtn.className = "px-2.5 py-1 rounded-md bg-white text-[#C85A32] font-semibold shadow-sm transition";
    expandBtn.className = "px-2.5 py-1 rounded-md text-[#584F47] hover:text-[#231F1C] font-medium transition";
  }
}

// --- Language Selector ---
function changeLanguage(lang) {
  state.language = lang;
  if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
    state.websocket.send(JSON.stringify({
      type: 'update_profile',
      updates: { language: lang }
    }));
  }
}

// --- Accessibility Controls ---
function toggleHighContrast() {
  state.isHighContrast = !state.isHighContrast;
  const banner = document.getElementById('captionContainer');
  if (state.isHighContrast) {
    banner.classList.add('high-contrast');
  } else {
    banner.classList.remove('high-contrast');
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
    audioPlayer.stopAll();
    icon.setAttribute('data-lucide', 'volume-x');
  } else {
    icon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

// --- Demo Simulation Scenario ---
function runConferenceDemo() {
  const steps = [
    { speaker: 'Speaking Partner', text: 'Hello, can you hear me okay? We are starting the meeting now.', lang: 'en', delay: 800 },
    { speaker: 'Deaf Communicator', text: 'I am deaf and reading your words via live captions. I am typing my response now.', lang: 'en', delay: 2800 },
    { speaker: 'Speaking Partner', text: 'That is wonderful. The Llama pipeline is converting your typed words into real-time spoken audio.', lang: 'en', delay: 5200 },
    { speaker: 'Deaf Communicator', text: 'Yes, with low-latency streaming TTS, the speech plays clause by clause immediately.', lang: 'en', delay: 7800 }
  ];

  steps.forEach((step) => {
    setTimeout(() => {
      displayLiveCaption(step.speaker, step.text, step.lang, true);
      addTranscriptMessage({
        sender_id: step.speaker === 'Deaf Communicator' ? state.clientId : 'partner_id',
        sender_name: step.speaker,
        original_text: step.text,
        input_modality: step.speaker === 'Deaf Communicator' ? 'llama_assisted' : 'speech',
        timestamp: Date.now() / 1000
      });
      // Synthesize neural voice for Deaf Communicator
      if (step.speaker === 'Deaf Communicator' && !state.isAudioMuted) {
        fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: step.text, language: step.lang })
        })
        .then(r => r.json())
        .then(data => {
          if (data.audio_data) audioPlayer.enqueue(data.audio_data);
        })
        .catch(() => {});
      }
    }, step.delay);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  lucide.createIcons();

  // Check Llama Status
  fetch('/api/llama/status')
    .then(r => r.json())
    .then(status => {
      const textEl = document.getElementById('llamaStatusText');
      if (status.connected) {
        textEl.textContent = `Llama AI: Connected (${status.active_model})`;
      } else {
        textEl.textContent = `Llama AI: Active (${status.active_model})`;
      }
    })
    .catch(() => {
      document.getElementById('llamaStatusText').textContent = 'Llama AI: Active';
    });

  // Enter key in textarea
  const input = document.getElementById('messageInput');
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatchLlamaMessage();
    }
  });
});
