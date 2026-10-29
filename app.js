/**
 * Mozhiverse (மொழிverse) Enterprise Real-Time Client Engine
 * High-Level, Zero-GIF, WCAG 2.1 AAA Compliant Assistive Telecommunications Suite
 */

const state = {
  clientId: 'user_' + Math.random().toString(36).substring(2, 9),
  roomId: 'main-room',
  currentPersonaKey: 'anand',
  profile: {
    name: 'Anand',
    language: 'ta',
    input_modality: 'speech',
    output_modality: 'audio'
  },
  ws: null,
  isRecording: false,
  recognition: null,
  speechVoices: [],
  isSpeakingAudio: false,
  audioMuted: false,
  bargeInEnabled: true,
  captionSizeLevel: 0, // 0: normal, 1: large, 2: xlarge
  isHighContrast: false,
  turnCount: 0,
  handRaised: false,
  reconnectAttempts: 0
};

// Language map for Web Speech API & Synthesis
const LANG_MAP = {
  ta: 'ta-IN',
  en: 'en-US',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
  te: 'te-IN'
};

const LANG_DISPLAY = {
  ta: 'Tamil (தமிழ்)',
  en: 'English (US)',
  hi: 'Hindi (हिन्दी)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ja: 'Japanese (日本語)',
  te: 'Telugu (తెలుగు)'
};

// Preset Profiles for Hackathon Evaluation
const PERSONA_PRESETS = {
  anand: {
    name: 'Anand',
    language: 'ta',
    input_modality: 'speech',
    output_modality: 'audio',
    roleTag: 'Anand (Tamil Voice)',
    tileId: 'tile-anand'
  },
  sarah: {
    name: 'Sarah',
    language: 'en',
    input_modality: 'both',
    output_modality: 'captions',
    roleTag: 'Sarah (Deaf Captions)',
    tileId: 'tile-sarah'
  },
  liam: {
    name: 'Liam',
    language: 'en',
    input_modality: 'text',
    output_modality: 'both',
    roleTag: 'Liam (Non-Verbal AAC)',
    tileId: 'tile-liam'
  }
};

// Conversational Fallback Dictionary for 0ms Instant Response
const CLIENT_DICTIONARY = {
  'ta:en': {
    'வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?': 'Hello! Can you hear me?',
    'வணக்கம்': 'Hello',
    'நான் இதை ஒப்புக்கொள்கிறேன்': 'I agree with this statement',
    'நான் மரியாதையுடன் ஏற்கவில்லை': 'I respectfully disagree',
    'தயவுசெய்து காத்திருங்கள், நான் எனது பதிலைத் தட்டச்சு செய்கிறேன்': 'Please wait a moment, I am typing my response',
    'தயவுசெய்து அதை மீண்டும் சொல்ல முடியுமா?': 'Could you please repeat that statement?',
    'எனக்கு ஒரு கேள்வி உள்ளது': 'I have a question to ask',
    'மிக்க நன்றி': 'Thank you very much'
  },
  'en:ta': {
    'Hello! Can you hear me?': 'வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?',
    'Yes Anand, I can read your speech captions clearly in English.': 'ஆம் ஆனந்த், உங்கள் பேச்சு தலைப்புகளை என்னால் ஆங்கிலத்தில் தெளிவாகப் படிக்க முடியும்.',
    'Please wait a moment, I am typing my response': 'தயவுசெய்து காத்திருங்கள், நான் எனது பதிலைத் தட்டச்சு செய்கிறேன்',
    'I cannot speak, but I hear you both and typed this.': 'என்னால் பேச முடியாது, ஆனால் உங்களை தெளிவாக கேட்க முடிகிறது, இதை தட்டச்சு செய்துள்ளேன்.',
    'I agree with this statement': 'நான் இதை ஒப்புக்கொள்கிறேன்',
    'I respectfully disagree': 'நான் மரியாதையுடன் ஏற்கவில்லை',
    'Could you please repeat that statement?': 'தயவுசெய்து அதை மீண்டும் சொல்ல முடியுமா?',
    'I have a question to ask': 'எனக்கு ஒரு கேள்வி உள்ளது',
    'Thank you very much': 'மிக்க நன்றி'
  }
};

window.addEventListener('DOMContentLoaded', () => {
  setupSpeechRecognition();
  setupSpeechSynthesis();
  initWebSocket();
  setupKeyboardShortcuts();
  selectPersona('anand');
});

// Setup Speech Recognition (Web Speech API)
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported in this browser.');
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.lang = LANG_MAP[state.profile.language] || 'en-US';

  state.recognition.onstart = () => {
    state.isRecording = true;
    updateMicButtonUI();
    setParticipantTileSpeaking(state.currentPersonaKey, true);
    notifyActivity('speaking', true);
  };

  state.recognition.onresult = (event) => {
    let interimText = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalText += event.results[i][0].transcript;
      } else {
        interimText += event.results[i][0].transcript;
      }
    }

    if (interimText) {
      showInterimSpeech(state.profile.name, interimText);
      sendWs({
        type: 'interim_speech',
        turn_id: 'turn_' + Date.now(),
        text: interimText
      });
    }

    if (finalText) {
      hideInterimSpeech();
      dispatchMessage(finalText.trim(), 'speech');
    }
  };

  state.recognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      showToast('Speech Recognition notice: ' + e.error, 'info');
    }
  };

  state.recognition.onend = () => {
    state.isRecording = false;
    updateMicButtonUI();
    setParticipantTileSpeaking(state.currentPersonaKey, false);
    notifyActivity('speaking', false);
    hideInterimSpeech();
  };
}

// Setup Speech Synthesis
function setupSpeechSynthesis() {
  if (!('speechSynthesis' in window)) return;
  const load = () => {
    state.speechVoices = window.speechSynthesis.getVoices();
  };
  load();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = load;
  }
}

// Speak incoming text using Text-to-Speech
function playTtsAudio(text, langCode) {
  if (state.audioMuted || !text || !('speechSynthesis' in window)) return;

  if (state.bargeInEnabled) {
    window.speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_MAP[langCode] || langCode;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  if (state.speechVoices.length > 0) {
    const matched = state.speechVoices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
    if (matched) utterance.voice = matched;
  }

  const eq = document.getElementById('captionEqualizer');

  utterance.onstart = () => {
    state.isSpeakingAudio = true;
    if (eq) {
      eq.classList.add('playing');
      eq.style.opacity = '1';
    }
  };

  utterance.onend = () => {
    state.isSpeakingAudio = false;
    if (eq) {
      eq.classList.remove('playing');
      eq.style.opacity = '0.4';
    }
  };

  utterance.onerror = () => {
    state.isSpeakingAudio = false;
    if (eq) {
      eq.classList.remove('playing');
      eq.style.opacity = '0.4';
    }
  };

  window.speechSynthesis.speak(utterance);
}

// Emergency Stop / Barge-In
function emergencyStopAudio() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.isSpeakingAudio = false;
  const eq = document.getElementById('captionEqualizer');
  if (eq) {
    eq.classList.remove('playing');
    eq.style.opacity = '0.4';
  }
  showToast('Speech playback halted immediately', 'info');
  sendWs({ type: 'cancel_audio' });
}

// Toggle Mic Speak
function toggleSpeechRecognition() {
  if (!state.recognition) {
    showToast('Speech recognition not available. Please use typed input or AAC.', 'info');
    return;
  }

  if (state.isRecording) {
    try {
      state.recognition.stop();
    } catch (e) {}
    state.isRecording = false;
    updateMicButtonUI();
  } else {
    if (state.bargeInEnabled) {
      emergencyStopAudio();
    }
    state.recognition.lang = LANG_MAP[state.profile.language] || 'en-US';
    try {
      state.recognition.start();
    } catch (e) {
      console.warn('Speech recognition start:', e);
    }
  }
}

function updateMicButtonUI() {
  const btn = document.getElementById('micToggleBtn');
  const txt = document.getElementById('micBtnText');
  const icn = document.getElementById('micIcon');

  if (state.isRecording) {
    btn.className = 'px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center space-x-2 transition shadow-md flex-shrink-0 recording-active-ring';
    txt.innerText = 'Listening... (Click to Finish)';
    icn.setAttribute('data-lucide', 'mic-off');
  } else {
    btn.className = 'px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center space-x-2 transition shadow-sm flex-shrink-0';
    txt.innerText = 'Speak (Mic)';
    icn.setAttribute('data-lucide', 'mic');
  }
  lucide.createIcons();
}

// WebSocket Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/room/${state.roomId}/${state.clientId}`;

  const ind = document.getElementById('connectionStatusIndicator');
  if (ind) {
    ind.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span><span>Connecting...</span>';
  }

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.reconnectAttempts = 0;
      if (ind) {
        ind.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Connected (Real-time)</span>';
      }
      sendWs({
        type: 'register',
        name: state.profile.name,
        language: state.profile.language,
        input_modality: state.profile.input_modality,
        output_modality: state.profile.output_modality
      });
    };

    state.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        handleServerPayload(data);
      } catch (err) {
        console.warn('WS parse error:', err);
      }
    };

    state.ws.onclose = () => {
      if (ind) {
        ind.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span><span>Local Standby Mode</span>';
      }
      scheduleReconnect();
    };

    state.ws.onerror = () => {
      if (state.ws) state.ws.close();
    };
  } catch (e) {
    console.warn('WebSocket init exception:', e);
  }
}

function scheduleReconnect() {
  if (state.reconnectAttempts < 5) {
    state.reconnectAttempts++;
    setTimeout(initWebSocket, 3000);
  }
}

function sendWs(payload) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(payload));
  }
}

// Handle Server Payloads
function handleServerPayload(data) {
  switch (data.type) {
    case 'welcome':
      if (data.transcript && data.transcript.length > 0) {
        data.transcript.forEach(t => renderMessageCard({
          seq_id: t.seq_id,
          sender_name: t.sender_name,
          sender_lang: t.sender_lang,
          recipient_lang: state.profile.language,
          original_text: t.original_text,
          display_text: t.translations ? (t.translations[state.profile.language] || t.original_text) : t.original_text,
          is_self: t.sender_id === state.clientId,
          input_modality: t.input_modality,
          is_aac: t.is_aac,
          timestamp: t.timestamp
        }));
      }
      break;

    case 'activity_update':
      updateParticipantActivity(data.sender_name, data.activity, data.is_active, data.interruption);
      break;

    case 'interim_speech':
      showInterimSpeech(data.sender_name, data.text);
      break;

    case 'cancel_audio':
      if (data.sender_id !== state.clientId) {
        emergencyStopAudio();
      }
      break;

    case 'message':
      hideInterimSpeech();
      onMessageReceived(data);
      break;
  }
}

function onMessageReceived(msg) {
  state.turnCount++;
  document.getElementById('turnCounter').innerText = `${state.turnCount} turns`;

  // Update Live Subtitle Banner
  updateLiveSubtitleBanner(msg);

  // Play Audio if instructed
  if (msg.should_play_audio && !msg.is_self) {
    playTtsAudio(msg.display_text, msg.recipient_lang);
  }

  // Append card to transcript
  renderMessageCard(msg);
}

function updateLiveSubtitleBanner(msg) {
  const speakerName = document.getElementById('ccSpeakerName');
  const langBadge = document.getElementById('ccLangBadge');
  const captionText = document.getElementById('captionText');

  speakerName.innerText = msg.sender_name;
  langBadge.innerText = `${msg.sender_lang.toUpperCase()} ➔ ${msg.recipient_lang.toUpperCase()} Translated`;
  captionText.innerText = msg.display_text;
}

function renderMessageCard(msg) {
  const box = document.getElementById('transcriptBox');
  const card = document.createElement('div');
  card.className = 'p-3.5 rounded-xl enterprise-card-elevated flex flex-col space-y-2 border border-slate-800';

  const timeStr = new Date((msg.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isSelf = msg.is_self;

  const modalityBadge = msg.is_aac 
    ? '<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-semibold">AAC Soundboard</span>'
    : (msg.input_modality === 'speech' 
      ? '<span class="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-semibold">🎙️ Voice</span>'
      : '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">⌨️ Typed</span>');

  card.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
      <div class="flex items-center space-x-2">
        <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
          ${msg.sender_name.substring(0, 2).toUpperCase()}
        </div>
        <span class="text-xs font-semibold ${isSelf ? 'text-blue-300' : 'text-white'}">
          ${msg.sender_name} ${isSelf ? '<span class="text-[10px] text-blue-400 font-normal">(You)</span>' : ''}
        </span>
        <span class="text-[10px] text-slate-500">#${msg.seq_id || state.turnCount} • ${timeStr}</span>
      </div>
      <div class="flex items-center space-x-2">
        ${modalityBadge}
        <span class="text-[10px] text-slate-400 font-medium">
          ${msg.sender_lang.toUpperCase()} ➔ ${msg.recipient_lang.toUpperCase()}
        </span>
      </div>
    </div>

    <!-- Translated Text (Primary) -->
    <div class="text-sm font-medium text-slate-100 py-0.5 leading-relaxed">
      ${escapeHtml(msg.display_text)}
    </div>

    <!-- Source Text Metadata & Replay -->
    <div class="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] text-slate-400">
      <div class="flex items-center space-x-1 truncate max-w-[80%]">
        <span class="text-slate-500">Original (${msg.sender_lang}):</span>
        <span class="italic text-slate-300 truncate">"${escapeHtml(msg.original_text)}"</span>
      </div>
      <button onclick="playTtsAudio('${escapeJs(msg.display_text)}', '${msg.recipient_lang}')" title="Replay Spoken Audio" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center space-x-1 flex-shrink-0">
        <i data-lucide="volume-2" class="w-3 h-3"></i>
        <span>Replay</span>
      </button>
    </div>
  `;

  box.appendChild(card);
  box.scrollTop = box.scrollHeight;
  lucide.createIcons();
}

// Interim Speech UI
function showInterimSpeech(speaker, text) {
  const box = document.getElementById('interimSpeechBox');
  const label = document.getElementById('interimSpeakerLabel');
  const prev = document.getElementById('interimTextPreview');

  label.innerText = `${speaker} is speaking...`;
  prev.innerText = `"${text}"`;
  box.classList.remove('hidden');
}

function hideInterimSpeech() {
  document.getElementById('interimSpeechBox').classList.add('hidden');
}

// Dispatch message (Voice or Typed)
async function dispatchMessage(text, modality = 'text', isAac = false) {
  if (!text || !text.trim()) return;

  // Local or WS dispatch
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    sendWs({
      type: 'message',
      text: text.trim(),
      input_modality: modality,
      is_aac: isAac
    });
  } else {
    // Local Standby Dispatch
    state.turnCount++;
    const recipientLang = state.profile.language;
    const translated = await translateOfflineOrApi(text.trim(), state.profile.language, recipientLang);

    onMessageReceived({
      seq_id: state.turnCount,
      sender_name: state.profile.name,
      sender_lang: state.profile.language,
      recipient_lang: recipientLang,
      original_text: text.trim(),
      display_text: translated,
      is_self: true,
      input_modality: modality,
      is_aac: isAac,
      should_play_audio: false,
      timestamp: Date.now() / 1000
    });
  }
}

// AAC Trigger
function triggerAacPhrase(englishText, tamilText) {
  const textToSend = state.profile.language === 'ta' ? tamilText : englishText;
  dispatchMessage(textToSend, 'text', true);
  showToast(`Assistive AAC Sent: "${textToSend}"`, 'info');
}

// Text Input Submit
function submitTextMessage() {
  const input = document.getElementById('chatTextInput');
  const text = input.value.trim();
  if (!text) return;
  dispatchMessage(text, 'text', false);
  input.value = '';
}

// Activity Notification
function notifyActivity(activity, isActive) {
  sendWs({
    type: 'activity',
    activity: activity,
    is_active: isActive
  });
}

function toggleHandRaise() {
  state.handRaised = !state.handRaised;
  notifyActivity('hand_raise', state.handRaised);
  const btn = document.getElementById('handRaiseBtn');
  if (state.handRaised) {
    btn.classList.add('border-amber-500', 'text-amber-400');
    showToast('Hand raised to request the floor ✋', 'info');
  } else {
    btn.classList.remove('border-amber-500', 'text-amber-400');
    showToast('Hand lowered', 'info');
  }
}

// Persona Switcher for Evaluation
function selectPersona(key) {
  const p = PERSONA_PRESETS[key];
  if (!p) return;

  state.currentPersonaKey = key;
  state.profile.name = p.name;
  state.profile.language = p.language;
  state.profile.input_modality = p.input_modality;
  state.profile.output_modality = p.output_modality;

  // Update active buttons in header
  ['personaBtnAnand', 'personaBtnSarah', 'personaBtnLiam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.className = 'px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center space-x-1.5';
    }
  });

  const activeBtnId = key === 'anand' ? 'personaBtnAnand' : (key === 'sarah' ? 'personaBtnSarah' : 'personaBtnLiam');
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.className = 'px-2.5 py-1.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-500 transition flex items-center space-x-1.5 shadow-sm';
  }

  // Update Conference Tiles "You" Badge
  document.getElementById('anandSelfBadge').classList.toggle('hidden', key !== 'anand');
  document.getElementById('sarahSelfBadge').classList.toggle('hidden', key !== 'sarah');
  document.getElementById('liamSelfBadge').classList.toggle('hidden', key !== 'liam');

  // Highlight active tile
  ['tile-anand', 'tile-sarah', 'tile-liam'].forEach(tid => {
    const tile = document.getElementById(tid);
    if (tile) tile.classList.remove('active-speaking');
  });

  document.getElementById('activeRoleLabel').innerText = p.roleTag;

  // Auto-switch for Sarah (Deaf) to larger captions for optimal presentation
  if (key === 'sarah') {
    state.captionSizeLevel = 1;
    applyCaptionSize();
  }

  // Update form inputs
  document.getElementById('userNameInput').value = p.name;
  document.getElementById('userLangSelect').value = p.language;
  document.getElementById('userInModality').value = p.input_modality;
  document.getElementById('userOutModality').value = p.output_modality;

  if (state.recognition) {
    state.recognition.lang = LANG_MAP[p.language] || 'en-US';
  }

  // Sync to server
  sendWs({
    type: 'update_profile',
    updates: {
      name: p.name,
      language: p.language,
      input_modality: p.input_modality,
      output_modality: p.output_modality
    }
  });

  showToast(`Active User Switched: ${p.roleTag}`, 'info');
}

function saveProfileChanges() {
  state.profile.name = document.getElementById('userNameInput').value.trim() || state.profile.name;
  state.profile.language = document.getElementById('userLangSelect').value;
  state.profile.input_modality = document.getElementById('userInModality').value;
  state.profile.output_modality = document.getElementById('userOutModality').value;
  state.bargeInEnabled = document.getElementById('bargeInToggle').checked;

  if (state.recognition) {
    state.recognition.lang = LANG_MAP[state.profile.language] || 'en-US';
  }

  sendWs({
    type: 'update_profile',
    updates: {
      name: state.profile.name,
      language: state.profile.language,
      input_modality: state.profile.input_modality,
      output_modality: state.profile.output_modality
    }
  });

  showToast('Profile configuration saved & synchronized', 'info');
}

// Conference Tile Status Helpers
function setParticipantTileSpeaking(personaKey, isSpeaking) {
  const p = PERSONA_PRESETS[personaKey];
  if (!p) return;
  const tile = document.getElementById(p.tileId);
  const wave = document.getElementById(personaKey + 'AudioWave');
  const statusTxt = document.getElementById(personaKey + 'StatusText');

  if (tile) tile.classList.toggle('active-speaking', isSpeaking);
  if (wave) {
    wave.classList.toggle('playing', isSpeaking);
    wave.style.opacity = isSpeaking ? '1' : '0.3';
  }
  if (statusTxt) {
    statusTxt.innerHTML = isSpeaking 
      ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span><span class="text-blue-300 font-semibold">Speaking Now</span>'
      : '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span><span>Listening</span>';
  }
}

function updateParticipantActivity(senderName, activity, isActive, isInterruption) {
  let key = 'anand';
  if (senderName.includes('Sarah')) key = 'sarah';
  else if (senderName.includes('Liam')) key = 'liam';

  if (activity === 'speaking') {
    setParticipantTileSpeaking(key, isActive);
  } else if (activity === 'typing') {
    const tile = document.getElementById('tile-' + key);
    const statusTxt = document.getElementById(key + 'StatusText');
    if (tile) tile.classList.toggle('active-typing', isActive);
    if (statusTxt) {
      statusTxt.innerHTML = isActive
        ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span><span class="text-amber-300 font-medium">Typing response...</span>'
        : '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span><span>Ready</span>';
    }
  }

  if (isInterruption) {
    showToast(`Floor Change: ${senderName} began speaking`, 'warning');
    if (state.bargeInEnabled) {
      emergencyStopAudio();
    }
  }
}

// Accessibility Tools
function toggleHighContrast() {
  state.isHighContrast = !state.isHighContrast;
  document.body.classList.toggle('high-contrast-mode', state.isHighContrast);
  showToast(`High-Contrast Mode: ${state.isHighContrast ? 'Enabled' : 'Disabled'}`, 'info');
}

function adjustCaptionSize(delta) {
  state.captionSizeLevel = Math.max(0, Math.min(2, state.captionSizeLevel + delta));
  applyCaptionSize();
}

function applyCaptionSize() {
  const el = document.getElementById('captionText');
  el.classList.remove('caption-size-normal', 'caption-size-large', 'caption-size-xlarge');
  if (state.captionSizeLevel === 0) el.classList.add('caption-size-normal');
  else if (state.captionSizeLevel === 1) el.classList.add('caption-size-large');
  else if (state.captionSizeLevel === 2) el.classList.add('caption-size-xlarge');
}

function toggleAudioMute() {
  state.audioMuted = !state.audioMuted;
  const icn = document.getElementById('muteIcon');
  if (state.audioMuted) {
    emergencyStopAudio();
    icn.setAttribute('data-lucide', 'volume-x');
    showToast('Voice Synthesizer Muted', 'info');
  } else {
    icn.setAttribute('data-lucide', 'volume-2');
    showToast('Voice Synthesizer Active', 'info');
  }
  lucide.createIcons();
}

function clearTranscript() {
  document.getElementById('transcriptBox').innerHTML = '';
  state.turnCount = 0;
  document.getElementById('turnCounter').innerText = '0 turns';
}

// Automated 3-Participant Demo Simulation for Hackathon Showcases!
async function runConferenceDemo() {
  showToast('Starting 3-Participant Live Accessible Scenario...', 'info');

  const demoScript = [
    {
      senderKey: 'anand',
      name: 'Anand',
      lang: 'ta',
      modality: 'speech',
      isAac: false,
      text: 'வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?',
      targetEn: 'Hello! Can you hear me?',
      targetTa: 'வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?'
    },
    {
      senderKey: 'sarah',
      name: 'Sarah',
      lang: 'en',
      modality: 'text',
      isAac: false,
      text: 'Yes Anand, I can read your speech captions clearly in English.',
      targetEn: 'Yes Anand, I can read your speech captions clearly in English.',
      targetTa: 'ஆம் ஆனந்த், உங்கள் பேச்சு தலைப்புகளை என்னால் ஆங்கிலத்தில் தெளிவாகப் படிக்க முடியும்.'
    },
    {
      senderKey: 'liam',
      name: 'Liam',
      lang: 'en',
      modality: 'text',
      isAac: true,
      text: 'Please wait a moment, I am typing my response',
      targetEn: 'Please wait a moment, I am typing my response',
      targetTa: 'தயவுசெய்து காத்திருங்கள், நான் எனது பதிலைத் தட்டச்சு செய்கிறேன்'
    },
    {
      senderKey: 'liam',
      name: 'Liam',
      lang: 'en',
      modality: 'text',
      isAac: false,
      text: 'I cannot speak, but I hear you both and typed this.',
      targetEn: 'I cannot speak, but I hear you both and typed this.',
      targetTa: 'என்னால் பேச முடியாது, ஆனால் உங்களை தெளிவாக கேட்க முடிகிறது, இதை தட்டச்சு செய்துள்ளேன்.'
    }
  ];

  for (let i = 0; i < demoScript.length; i++) {
    const turn = demoScript[i];

    // Trigger visual speaking/typing state on tile
    if (turn.modality === 'speech') {
      setParticipantTileSpeaking(turn.senderKey, true);
      showInterimSpeech(turn.name, turn.text.substring(0, 15) + '...');
    } else {
      updateParticipantActivity(turn.name, 'typing', true, false);
    }

    await new Promise(r => setTimeout(r, 1600));

    setParticipantTileSpeaking(turn.senderKey, false);
    updateParticipantActivity(turn.name, 'typing', false, false);
    hideInterimSpeech();

    // Determine target translation for active viewer
    const viewerLang = state.profile.language;
    let displayText = (viewerLang === 'ta') ? turn.targetTa : turn.targetEn;

    // Check if API can translate
    try {
      const resp = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: turn.text,
          source_lang: turn.lang,
          target_lang: viewerLang
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.translated_text) displayText = d.translated_text;
      }
    } catch (e) {
      // Offline fallback already assigned
    }

    onMessageReceived({
      seq_id: i + 1,
      sender_name: turn.name,
      sender_lang: turn.lang,
      recipient_lang: viewerLang,
      original_text: turn.text,
      display_text: displayText,
      is_self: turn.senderKey === state.currentPersonaKey,
      input_modality: turn.modality,
      is_aac: turn.isAac,
      should_play_audio: state.profile.output_modality in { audio: 1, both: 1 },
      timestamp: Date.now() / 1000
    });

    await new Promise(r => setTimeout(r, 2200));
  }

  showToast('Demonstration Complete: All modalities synchronized successfully.', 'info');
}

// Offline / API Translation Helper
async function translateOfflineOrApi(text, src, tgt) {
  if (src === tgt) return text;

  try {
    const resp = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: src, target_lang: tgt })
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.translated_text || text;
    }
  } catch (e) {}

  const key = `${src}:${tgt}`;
  if (CLIENT_DICTIONARY[key] && CLIENT_DICTIONARY[key][text]) {
    return CLIENT_DICTIONARY[key][text];
  }
  return text;
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.getElementById('chatTextInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitTextMessage();
    } else {
      notifyActivity('typing', true);
      clearTimeout(window.typingTimer);
      window.typingTimer = setTimeout(() => {
        notifyActivity('typing', false);
      }, 1200);
    }
  });

  window.addEventListener('keydown', (e) => {
    // Esc emergency stop
    if (e.key === 'Escape') {
      emergencyStopAudio();
    }
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const borderCol = type === 'warning' ? 'border-amber-500' : 'border-blue-500';
  toast.className = `p-3 rounded-lg bg-slate-900 border ${borderCol} text-xs text-slate-100 shadow-xl pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerText = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
}
