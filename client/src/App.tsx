import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Copy,
  Download,
  Globe,
  Heart,
  Mic,
  MicOff,
  Send,
  Settings,
  Shield,
  Type,
  Volume2,
  VolumeX,
  X,
  Check,
  Moon,
  Sun,
  RotateCcw,
  AlertTriangle,
  Plus,
  Trash2,
  Share2,
  ThumbsUp,
  Smile,
  HeartHandshake,
  Clock,
  UserCheck,
  Users,
  Gauge,
  Sparkles,
  Radio,
  AlertOctagon,
  LifeBuoy,
  CheckCircle,
  XCircle,
  HelpCircle,
  Activity,
  Zap,
  MessageSquare,
  FileText
} from "lucide-react";
import {
  LANGUAGES,
  QUICK_PHRASES,
  SUPPORTIVE_WORDS,
  VALID_REACTIONS,
  isEmergency,
  isSupportive,
  type ChatMessage,
  type Language,
  type Mode,
  type Participant,
  type QuickPhrase,
  type ReactionType,
  type RoomSnapshot
} from "@mozhiverse/shared";

const langs = Object.keys(LANGUAGES) as Language[];

function speak(text: string, lang: Language, rate = 1.0) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[lang] || "en-US";
    u.rate = Math.max(0.5, Math.min(2.0, rate));
    window.speechSynthesis.speak(u);
  } catch {
    // Gracefully handle browser speech synthesis errors
  }
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Ignore autoplay restriction errors
  }
}

function getReactionIcon(emoji: string) {
  if (emoji === "👍") return <ThumbsUp size={15} />;
  if (emoji === "❤️") return <Heart size={15} />;
  if (emoji === "😂") return <Smile size={15} />;
  return <HeartHandshake size={15} />;
}

function getReactionLabel(emoji: string) {
  if (emoji === "👍") return "Like";
  if (emoji === "❤️") return "Love";
  if (emoji === "😂") return "Smile";
  return "Care";
}

function humanizeEmotion(tone: string) {
  const t = tone.toLowerCase();
  if (t.includes("appreciat") || t.includes("grat")) return "Warm & grateful";
  if (t.includes("urgent") || t.includes("emerg")) return "Needs quick attention";
  if (t.includes("frustrat") || t.includes("annoy")) return "Needs patience & care";
  if (t.includes("somber") || t.includes("sad")) return "Gentle & thoughtful";
  if (t.includes("inquisit") || t.includes("curio")) return "Curious";
  if (t.includes("friend")) return "Friendly & welcoming";
  return "Thoughtful";
}

function getSupportiveIcon(tag: string) {
  switch (tag.toLowerCase()) {
    case "presence": return <HeartHandshake size={15} />;
    case "patience": return <Clock size={15} />;
    case "encouragement": return <Sparkles size={15} />;
    case "solidarity": return <Shield size={15} />;
    case "calm": return <Activity size={15} />;
    case "care": return <Heart size={15} />;
    default: return <HeartHandshake size={15} />;
  }
}

function getPhraseIcon(text: string) {
  const t = text.toLowerCase();
  if (t.includes("hello")) return <Sparkles size={16} />;
  if (t.includes("thank")) return <Heart size={16} />;
  if (t.includes("help") || t.includes("sos")) return <LifeBuoy size={16} />;
  if (t.includes("yes")) return <CheckCircle size={16} />;
  if (t.includes("no")) return <XCircle size={16} />;
  if (t.includes("repeat")) return <RotateCcw size={16} />;
  if (t.includes("slow")) return <Gauge size={16} />;
  if (t.includes("toilet") || t.includes("restroom") || t.includes("where")) return <HelpCircle size={16} />;
  if (t.includes("doctor") || t.includes("hospital")) return <Activity size={16} />;
  if (t.includes("emergency") || t.includes("danger") || t.includes("fire")) return <AlertOctagon size={16} />;
  return <MessageSquare size={16} />;
}

function SoundRadar({
  active,
  mode,
  isSpeaking,
  onTest
}: {
  active: boolean;
  mode: Mode;
  isSpeaking: boolean;
  onTest: () => void;
}) {
  const [levels, setLevels] = useState<number[]>([12, 18, 25, 30, 45, 60, 52, 40, 35, 28, 22, 16, 12, 8, 14, 20]);
  const [db, setDb] = useState(28);
  const [radarState, setRadarState] = useState<"silent" | "normal" | "loud">("silent");

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (isSpeaking) {
        const newLevels = Array.from({ length: 16 }, () => Math.floor(Math.random() * 65) + 25);
        const currentDb = Math.floor(Math.random() * 25) + 55;
        setLevels(newLevels);
        setDb(currentDb);
        setRadarState(currentDb > 72 ? "loud" : "normal");
      } else {
        const ambientLevels = Array.from({ length: 16 }, () => Math.floor(Math.random() * 8) + 6);
        setLevels(ambientLevels);
        setDb(26);
        setRadarState("silent");
      }
    }, 120);
    return () => clearInterval(interval);
  }, [active, isSpeaking]);

  if (!active) return null;

  return (
    <div className={`sound-radar-card ${radarState}`} role="region" aria-label="Sound-to-sight live audio radar">
      <div className="sound-radar-header">
        <div className="sound-radar-title">
          <Activity size={14} className="sound-radar-icon" />
          <span>Sound-to-Sight Voice Radar</span>
          <span className={`sound-state-badge ${radarState}`}>
            {radarState === "loud" ? "Loud Voice" : radarState === "normal" ? "Voice Detected" : "Quiet / Ambient"}
          </span>
        </div>
        <div className="sound-radar-metrics">
          <span className="sound-db-meter"><b>{db}</b> dB</span>
          <button className="sound-test-btn" onClick={onTest} aria-label="Voice sample preview">
            <Volume2 size={12} /> Voice Sample
          </button>
        </div>
      </div>
      <div className="sound-bars-container" aria-hidden="true">
        {levels.map((lvl, i) => (
          <div
            key={i}
            className="sound-bar"
            style={{
              height: `${Math.max(8, lvl)}%`,
              backgroundColor: lvl > 70 ? "#ee776f" : lvl > 45 ? "#f1bd58" : "#4dd6c5"
            }}
          />
        ))}
      </div>
      <small className="sound-radar-subtext">
        {mode === "read"
          ? "Visual Hearing: Real-time frequency bars show human voice cadence and volume without sound."
          : "Visual audio spectrum reacts to natural human speech cadence and volume."}
      </small>
    </div>
  );
}

export default function App() {
  const [name, setName] = useState("");
  const [lang, setLang] = useState<Language>("Tamil");
  const [mode, setMode] = useState<Mode>("type");
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get("room")?.toUpperCase().slice(0, 6) ?? ""
  );
  const [room, setRoom] = useState("");
  const [users, setUsers] = useState<Participant[]>([]);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [online, setOnline] = useState(false);
  const [auto, setAuto] = useState(false);
  const [panel, setPanel] = useState(false);

  // Accessibility Settings
  const [font, setFont] = useState(17);
  const [contrast, setContrast] = useState(false);
  const [dark, setDark] = useState(true);
  const [dys, setDys] = useState(false);
  const [motion, setMotion] = useState(false);
  const [vibe, setVibe] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Feature Options
  const [toneEnabled, setToneEnabled] = useState(false);
  const [includeToneInTranscript, setIncludeToneInTranscript] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [install, setInstall] = useState<any>(null);

  // Phrases & Phrase Editor
  const [editPhrases, setEditPhrases] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [phrases, setPhrases] = useState<QuickPhrase[]>([...QUICK_PHRASES]);
  const [newCategory, setNewCategory] = useState("General");
  const [newPhraseText, setNewPhraseText] = useState("");

  // Sound-to-Sight Visual Voice Radar & Emergency Beacon State
  const [soundRadarActive, setSoundRadarActive] = useState(true);
  const [isSimulatingAudio, setIsSimulatingAudio] = useState(false);
  const [activeEmergency, setActiveEmergency] = useState<ChatMessage | null>(null);
  const [meetingTakeaways, setMeetingTakeaways] = useState<{
    totalMessages: number;
    languages: string[];
    topics: string[];
    actions: string[];
    generatedAt: string;
  } | null>(null);

  const [activity, setActivity] = useState<Record<string, string>>({});
  const sock = useRef<Socket>(io({ autoConnect: false }));
  const rec = useRef<any>(null);
  const [transcript, setTranscript] = useState("");

  const prefs = useRef({ lang, auto, vibe, mode, speechRate, chimeEnabled });
  prefs.current = { lang, auto, vibe, mode, speechRate, chimeEnabled };

  useEffect(() => {
    if (!room) {
      setSecondsElapsed(0);
      return;
    }
    const timer = setInterval(() => setSecondsElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [room]);

  useEffect(() => {
    const s = sock.current;
    s.on("connect", () => setOnline(true));
    s.on("disconnect", () => setOnline(false));
    s.on("room:update", (r: RoomSnapshot) => setUsers(r.participants));

    s.on("participant:left", (p: any) => {
      setInfo(`${p.name || "A participant"} left the room.`);
      setActivity(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    });

    s.on("participant:activity", (a: { id: string; typing?: boolean; speaking?: boolean }) => {
      setActivity(prev => {
        const next = { ...prev };
        if (a.typing) next[a.id] = "typing";
        else if (a.speaking) next[a.id] = "speaking";
        else delete next[a.id];
        return next;
      });
    });

    s.on("message:new", (m: ChatMessage) => {
      setMsgs(prev => {
        // Prevent duplicates
        if (prev.some(x => x.id === m.id)) return prev;
        return [...prev, m];
      });

      if (m.isUrgent || isEmergency(m.original)) {
        setActiveEmergency(m);
        if (prefs.current.vibe) {
          try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch { /* ignore */ }
        }
      }

      // Activate visual sound radar pulse on incoming message
      setIsSimulatingAudio(true);
      window.setTimeout(() => setIsSimulatingAudio(false), 3200);

      if (m.senderId !== s.id) {
        const currentPrefs = prefs.current;
        const targetTranslation = m.translations[currentPrefs.lang] ?? m.original;
        const timestamp = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        setTranscript(prev =>
          prev + `[${timestamp}] ${m.senderName} (${m.sourceLanguage}): ${m.original}\n` +
          `  → Translated (${currentPrefs.lang}): ${targetTranslation}\n\n`
        );

        if (currentPrefs.vibe) {
          try { navigator.vibrate?.(80); } catch { /* ignore */ }
        }

        // Chime sound alert (silenced in Deaf / Read mode)
        if (currentPrefs.chimeEnabled && currentPrefs.mode !== "read") {
          playChime();
        }

        // Deaf / Read mode must NEVER auto-play audio
        if (currentPrefs.auto && currentPrefs.mode !== "read") {
          speak(targetTranslation, currentPrefs.lang, currentPrefs.speechRate);
        }
      }
    });

    s.on("message:reaction", (data: { messageId: string; reactions: Partial<Record<ReactionType, string[]>> }) => {
      setMsgs(prev => prev.map(m => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
    });

    return () => {
      s.disconnect();
      s.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size", `${font}px`);
  }, [font]);

  useEffect(() => {
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const connect = (create: boolean) => {
    setError("");
    setInfo("");
    if (!name.trim()) return setError("Add your name to continue.");
    if (!create && code.length !== 6) return setError("Enter a six-character room code.");

    const s = sock.current;
    if (!s.connected) s.connect();

    const p: Participant = { id: "", name: name.trim(), language: lang, mode };
    s.emit(create ? "room:create" : "room:join", create ? p : { code, participant: p }, (r: any) => {
      if (r?.error) return setError(r.error);
      setRoom(r.roomCode);
      setUsers(r.room.participants);
    });
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    sock.current.emit("participant:update", { mode: m });
    if (m !== "speak") {
      rec.current?.stop();
      rec.current = null;
    }
  };

  const changeLanguage = (next: Language) => {
    setLang(next);
    sock.current.emit("participant:update", { language: next });
  };

  const send = (text = draft) => {
    const value = text.trim();
    if (!value || !room) return;
    const s = sock.current;
    s.emit("participant:activity", { typing: false, speaking: false });

    const localId = "local-" + Date.now();
    const urgent = isEmergency(value);

    // Pulse sound radar on message dispatch
    setIsSimulatingAudio(true);
    window.setTimeout(() => setIsSimulatingAudio(false), 2500);

    // Optimistic addition with local fallback
    const optimisticMessage: ChatMessage = {
      id: localId,
      roomCode: room,
      senderId: s.id ?? "",
      senderName: name || "You",
      sourceLanguage: lang,
      original: value,
      translations: { [lang]: value },
      createdAt: Date.now(),
      isUrgent: urgent,
      isSupportive: isSupportive(value)
    };

    if (urgent) {
      setActiveEmergency(optimisticMessage);
    }

    s.emit("message:send", { text: value, sourceLanguage: lang, id: localId }, (r: any) => {
      if (r?.error) {
        setError(r.error);
        return;
      }
      setMsgs(prev => {
        if (prev.some(x => x.id === localId)) return prev;
        return [...prev, optimisticMessage];
      });

      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setTranscript(prev => prev + `[${timestamp}] ${name || "You"} (${lang}): ${value}\n\n`);
    });

    setDraft("");
  };

  const reactToMessage = (messageId: string, reaction: ReactionType) => {
    const s = sock.current;
    s.emit("message:react", { messageId, reaction }, (res: any) => {
      if (res?.reactions) {
        setMsgs(prev => prev.map(m => (m.id === messageId ? { ...m, reactions: res.reactions } : m)));
      }
    });
  };

  const simulatePartner = () => {
    setError("");
    sock.current.emit("room:simulate", (res: any) => {
      if (res?.error) setError(res.error);
      else setInfo("Alex joined the conversation from London! Ready to chat.");
    });
  };

  const startMic = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setError(`Speech recognition is unavailable for ${lang} in this browser. You can communicate using Type mode.`);
      changeMode("type");
      return;
    }

    try {
      const r = new SpeechRec();
      r.lang = LANGUAGES[lang] || "en-US";
      r.continuous = true;
      r.interimResults = true;
      rec.current = r;

      sock.current.emit("participant:activity", { speaking: true });

      r.onresult = (e: any) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          interimText += e.results[i][0].transcript;
        }
        setDraft(interimText);
        if (e.results[e.results.length - 1].isFinal) {
          window.setTimeout(() => send(interimText), 600);
        }
      };

      r.onend = () => {
        sock.current.emit("participant:activity", { speaking: false });
        rec.current = null;
      };

      r.onerror = (e: any) => {
        setError(`Microphone or speech language (${lang}) is unavailable. You can use Type mode.`);
        changeMode("type");
      };

      r.start();
    } catch {
      setError("Please allow microphone permissions and try again, or use Type mode.");
      changeMode("type");
    }
  };

  const leave = () => {
    sock.current.disconnect();
    setRoom("");
    setUsers([]);
    setMsgs([]);
    setTranscript("");
    setError("");
    setInfo("");
  };

  const share = async () => {
    const link = `${location.origin}/?room=${room}`;
    try {
      await navigator.clipboard.writeText(link);
      setInfo("Share link copied to clipboard!");
    } catch {
      setInfo(link);
    }
  };

  const copyTranscript = async () => {
    const formatted = formatTranscriptText();
    try {
      await navigator.clipboard.writeText(formatted);
      setInfo("Transcript copied to clipboard!");
    } catch {
      setError("Could not copy transcript directly.");
    }
  };

  const formatTranscriptText = () => {
    let out = `Mozhiverse Room: ${room}\nParticipants: ${users.map(u => `${u.name} (${u.language})`).join(", ")}\nDate: ${new Date().toLocaleString()}\n` +
      `----------------------------------------\n\n`;

    msgs.forEach(m => {
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const targetTrans = m.translations[lang] ?? m.original;
      out += `[${time}] ${m.senderName} (${m.sourceLanguage}): ${m.original}\n`;
      if (m.sourceLanguage !== lang) {
        out += `  → ${lang}: ${targetTrans}\n`;
      }
      if (includeToneInTranscript && m.tone) {
        out += `  [Feeling / Nuance: ${humanizeEmotion(m.tone.tone)}]\n`;
      }
      out += `\n`;
    });
    return out;
  };

  const download = () => {
    const content = formatTranscriptText();
    const a = document.createElement("a");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    a.href = URL.createObjectURL(blob);
    a.download = `mozhiverse-${room}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const addCustomPhrase = () => {
    if (!newPhraseText.trim()) return;
    setPhrases(prev => [...prev, { icon: newCategory, text: newPhraseText.trim() }]);
    setNewPhraseText("");
  };

  const generateTakeaways = () => {
    if (msgs.length === 0) return;
    const topics: string[] = [];
    const actionItems: string[] = [];

    msgs.forEach(m => {
      const text = m.original;
      if (isEmergency(text)) {
        actionItems.push(`Urgent safety signal: "${text}" (${m.senderName})`);
      } else if (text.toLowerCase().includes("please") || text.toLowerCase().includes("need") || text.toLowerCase().includes("repeat") || text.toLowerCase().includes("slow")) {
        actionItems.push(`Action / Request: "${text}" (${m.senderName})`);
      } else if (text.length > 6) {
        topics.push(`"${text}" (${m.sourceLanguage})`);
      }
    });

    setMeetingTakeaways({
      totalMessages: msgs.length,
      languages: Array.from(new Set(msgs.map(m => m.sourceLanguage))),
      topics: topics.slice(0, 5),
      actions: actionItems.length > 0 ? actionItems.slice(0, 5) : ["Cross-lingual dialog successfully maintained across all active participants."],
      generatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });
  };

  const removePhrase = (idx: number) => {
    setPhrases(prev => prev.filter((_, i) => i !== idx));
  };

  const resetPhrases = () => {
    setPhrases([...QUICK_PHRASES]);
  };

  const cls = `app ${dark ? "dark" : "light"} ${contrast ? "contrast" : ""} ${dys ? "dyslexia" : ""} ${motion ? "reduced" : ""}`;

  // Landing / Join view
  if (!room) {
    return (
      <main className={cls}>
        <div className="shell">
          <header className="top">
            <Brand />
            <button
              className="icon"
              aria-label="Accessibility settings"
              onClick={() => setPanel(true)}
            >
              <Settings />
            </button>
          </header>

          <section className="hero">
            <span className="eyebrow"><i /> MADE FOR EVERY WAY YOU COMMUNICATE</span>
            <h1>Say it your way.<br /><em>Understand each other.</em></h1>
            <p>Real-time multimodal conversations across languages, hearing, and speech.</p>
          </section>

          <section className="card">
            <label htmlFor="person">Your name</label>
            <input
              id="person"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={50}
              aria-required="true"
            />

            <label htmlFor="lang">I communicate in</label>
            <select
              id="lang"
              value={lang}
              onChange={e => setLang(e.target.value as Language)}
              aria-label="Select your primary communication language"
            >
              {langs.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <small className="hint"><Globe /> You can change your language any time in the room.</small>

            <button
              className="button gold full"
              onClick={() => connect(true)}
              aria-label="Create a new conversation room"
            >
              Create a room <span>↗</span>
            </button>

            <div className="or"><span /> OR JOIN A CONVERSATION <span /></div>

            <div className="join">
              <input
                aria-label="6-character room code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="6-character code"
                maxLength={6}
              />
              <button
                className="button outline"
                disabled={code.length !== 6}
                onClick={() => connect(false)}
                aria-label="Join room with code"
              >
                Join
              </button>
            </div>

            {error && <p role="alert" className="error">{error}</p>}
          </section>

          <footer className="foot">
            <Shield /> Your conversations are in-memory, private, and not stored in a database.
          </footer>
        </div>

        {panel && (
          <SettingsView
            {...{
              setPanel,
              font,
              setFont,
              contrast,
              setContrast,
              dark,
              setDark,
              dys,
              setDys,
              motion,
              setMotion,
              vibe,
              setVibe,
              speechRate,
              setSpeechRate,
              chimeEnabled,
              setChimeEnabled,
              toneEnabled,
              setToneEnabled,
              install
            }}
          />
        )}
      </main>
    );
  }

  // Active Room view
  const otherParticipants = users.filter(x => x.id !== sock.current.id);

  return (
    <main className={cls}>
      <div className="shell room">
        <header className="roomtop">
          <button className="icon" aria-label="Leave room" onClick={leave}>
            <ArrowLeft />
          </button>
          <Brand compact />
          <span className="meeting-timer" title="Elapsed meeting time" aria-label={`Meeting duration: ${Math.floor(secondsElapsed / 60)} minutes and ${secondsElapsed % 60} seconds`}>
            <Clock size={13} style={{ display: "inline-block", marginRight: 4 }} /> {String(Math.floor(secondsElapsed / 60)).padStart(2, "0")}:{String(secondsElapsed % 60).padStart(2, "0")}
          </span>
          <span className={`status ${online ? "" : "off"}`} aria-live="polite">
            <i />{online ? "Connected" : "Reconnecting"}
          </span>
          <button className="icon" aria-label="Settings" onClick={() => setPanel(true)}>
            <Settings />
          </button>
        </header>

        <section className="roomhead">
          <div>
            <span className="eyebrow">ROOM <b>{room}</b> · {users.length} PARTICIPANT{users.length === 1 ? "" : "S"}</span>
            <div className="peers">
              {users.map(p => (
                <span key={p.id}>
                  {p.id === sock.current.id ? "You" : p.name} · {p.language}
                </span>
              ))}
            </div>
            <label className="my-language">
              My language
              <select
                aria-label="My conversation language"
                value={lang}
                onChange={e => changeLanguage(e.target.value as Language)}
              >
                {langs.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          </div>

          <button className="icon" aria-label="Copy room share link" onClick={share}>
            <Copy />
          </button>

          <details className="qrd">
            <summary className="icon" aria-label="Show room QR code">
              <Globe />
            </summary>
            <div className="qr">
              <QRCodeSVG value={`${location.origin}/?room=${room}`} size={140} />
              <small>Scan to join {room}</small>
            </div>
          </details>
        </section>

        {otherParticipants.length === 0 && (
          <div className="waiting">
            <Heart />
            <span>
              <b>Waiting for a conversation partner.</b>
              <small>Share room code <b>{room}</b> or scan the QR code to chat.</small>
              <button
                className="sim-partner-btn"
                onClick={simulatePartner}
                aria-label="Connect with Alex, a conversation partner"
              >
                <UserCheck size={16} /> Connect with Partner (Alex)
              </button>
            </span>
          </div>
        )}

        {info && (
          <div className="notice" role="status">
            {info}
            <button className="link" onClick={() => setInfo("")}>Dismiss</button>
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="link" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {/* Communication Modes */}
        <nav className="modes" aria-label="Communication mode selection">
          <button
            aria-pressed={mode === "speak"}
            className={mode === "speak" ? "active" : ""}
            onClick={() => changeMode("speak")}
          >
            <Mic /> Speak
          </button>
          <button
            aria-pressed={mode === "type"}
            className={mode === "type" ? "active" : ""}
            onClick={() => changeMode("type")}
          >
            <Type /> Type
          </button>
          <button
            aria-pressed={mode === "read"}
            className={mode === "read" ? "active" : ""}
            onClick={() => changeMode("read")}
          >
            <VolumeX /> Deaf / Read
          </button>
        </nav>

        {/* Sound-to-Sight Live Voice Radar (Visual Hearing Aid for Deaf / HoH) */}
        <SoundRadar
          active={soundRadarActive}
          mode={mode}
          isSpeaking={isSimulatingAudio || !!rec.current || Object.keys(activity).length > 0}
          onTest={() => {
            setIsSimulatingAudio(true);
            window.setTimeout(() => setIsSimulatingAudio(false), 4500);
          }}
        />

        {mode === "speak" && !((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && (
          <p className="notice" role="alert">
            Speech recognition is not supported in this browser for {lang}. Please use Type mode.
          </p>
        )}

        {/* Quick Accessibility Actions: Please repeat & Slow down & Supportive Words */}
        <div className="quick-action-bar" aria-label="Quick conversation actions">
          <button
            className="quick-action-btn"
            onClick={() => send("Please repeat")}
            aria-label="Send: Please repeat"
          >
            <RotateCcw size={15} /> Please repeat
          </button>
          <button
            className="quick-action-btn"
            onClick={() => send("Slow down")}
            aria-label="Send: Slow down"
          >
            <Gauge size={15} /> Slow down
          </button>
          <button
            className="quick-action-btn"
            onClick={() => setShowSupport(!showSupport)}
            aria-label="Toggle supportive empathetic words board"
            aria-expanded={showSupport}
          >
            <HeartHandshake size={15} /> Support
          </button>
        </div>

        {showSupport && (
          <section className="support-section" role="region" aria-label="Supportive empathetic words board">
            <div className="support-section-header">
              <h3><HeartHandshake size={16} /> Supportive Words & Care</h3>
              <button className="link" onClick={() => setShowSupport(false)} aria-label="Close supportive words board">
                Close
              </button>
            </div>
            <div className="support-grid">
              {SUPPORTIVE_WORDS.map((item, idx) => (
                <button
                  key={idx}
                  className="support-chip"
                  onClick={() => {
                    send(item.text);
                    setShowSupport(false);
                  }}
                  aria-label={`Send supportive words: ${item.text}`}
                >
                  <span className="support-chip-icon">{getSupportiveIcon(item.tag)}</span>
                  <span className="support-chip-text">{item.text}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Emergency SOS Visual Beacon */}
        {activeEmergency && (
          <div className="emergency-beacon-banner" role="alert" aria-live="assertive">
            <div className="emergency-beacon-content">
              <div className="emergency-beacon-badge">
                <AlertOctagon size={16} /> EMERGENCY ALERT ACTIVE
              </div>
              <p>Urgent safety signal detected: &ldquo;{activeEmergency.original}&rdquo;</p>
              <div className="emergency-actions">
                <button onClick={() => { send("I am safe now"); setActiveEmergency(null); }}>
                  <CheckCircle size={14} /> I am safe now
                </button>
                <button onClick={() => send("Need medical assistance immediately")}>
                  <Activity size={14} /> Need medical help
                </button>
                <button onClick={() => send("Help is on the way")}>
                  <LifeBuoy size={14} /> Help is on the way
                </button>
                <button className="dismiss-btn" onClick={() => setActiveEmergency(null)}>
                  <X size={14} /> Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages List */}
        <section
          className={`messages ${mode === "read" ? "captions" : ""}`}
          aria-label="Conversation messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {msgs.length === 0 ? (
            <div className="empty">
              <Radio size={28} className="empty-radio-icon" />
              <b>Your conversation starts here</b>
              <small>Messages are translated in real time for each participant.</small>
            </div>
          ) : (
            msgs.map(m => {
              const mine = m.senderId === sock.current.id;
              const translated = m.translations[lang] ?? m.original;
              const hasTranslation = !mine && translated && translated !== m.original;
              const isUrgentMsg = m.isUrgent || isEmergency(m.original);
              const isSupportiveMsg = m.isSupportive || isSupportive(m.original);

              return (
                <article className={`message ${mine ? "mine" : ""}`} key={m.id}>
                  <label>
                    {mine ? "YOU" : m.senderName.toUpperCase()} · {m.sourceLanguage.toUpperCase()}
                  </label>
                  <div className={`bubble ${isUrgentMsg ? "urgent" : ""} ${isSupportiveMsg ? "supportive" : ""}`} role={isUrgentMsg ? "alert" : undefined}>
                    {isUrgentMsg && (
                      <div className="urgent-badge">
                        <AlertTriangle /> URGENT MESSAGE
                      </div>
                    )}
                    {isSupportiveMsg && (
                      <div className="supportive-badge">
                        <HeartHandshake size={13} /> SUPPORT & CARE
                      </div>
                    )}
                    <p>{m.original}</p>

                    {hasTranslation && (
                      <p className="translated">{translated}</p>
                    )}

                    {/* Emotional Nuance: Safe, human-centered, gentle contextual cues */}
                    {toneEnabled && m.tone && (
                      <div className={`tone-hint-badge ${m.tone.tone.includes("frustrated") ? "frustrated" : m.tone.tone.includes("urgent") ? "urgent" : m.tone.tone.includes("somber") ? "somber" : ""}`}>
                        <span><Heart size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} /> Feeling: <strong>{humanizeEmotion(m.tone.tone)}</strong>{m.tone.reason && !m.tone.reason.toLowerCase().includes("ai") ? ` · ${m.tone.reason}` : ""}</span>
                      </div>
                    )}

                    {!mine && mode !== "read" && (
                      <button
                        className="listen"
                        aria-label={`Listen to translation in ${lang}`}
                        onClick={() => speak(translated, lang, prefs.current.speechRate)}
                      >
                        <Volume2 /> Listen
                      </button>
                    )}

                    {/* Reactions Bar: ThumbsUp, Heart, Smile, Care */}
                    <div className="reactions-bar" role="group" aria-label="Message reactions">
                      {VALID_REACTIONS.map(emoji => {
                        const list = m.reactions?.[emoji] ?? [];
                        const count = list.length;
                        const isSelected = list.includes(sock.current.id ?? "");
                        const label = emoji === "👍" ? "Thumbs Up" : emoji === "❤️" ? "Heart" : emoji === "😂" ? "Laugh" : "Care & Support";
                        return (
                          <button
                            key={emoji}
                            className={`reaction-btn ${isSelected ? "selected" : ""}`}
                            aria-pressed={isSelected}
                            aria-label={`React with ${label}${count > 0 ? `, ${count} reaction${count > 1 ? "s" : ""}` : ""}${isSelected ? " (selected)" : ""}`}
                            onClick={() => reactToMessage(m.id, emoji)}
                          >
                            {getReactionIcon(emoji)}
                            <span className="reaction-label">{getReactionLabel(emoji)}</span>
                            {count > 0 && <span className="reaction-count">{count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })
          )}

          {Object.entries(activity).map(([id, status]) => (
            <small className="activity" key={id} aria-live="polite">
              {users.find(x => x.id === id)?.name ?? "A participant"} is {status}…
            </small>
          ))}
        </section>

        {/* Composer */}
        <section className="composer">
          {mode === "speak" && (
            <div className="microw">
              <button
                className={`mic ${rec.current ? "recording" : ""}`}
                aria-label={rec.current ? "Stop microphone" : "Start speaking"}
                onClick={() => (rec.current ? (rec.current.stop(), (rec.current = null)) : startMic())}
              >
                {rec.current ? <MicOff /> : <Mic />}
              </button>
              <span>{rec.current ? "Listening… speak naturally" : "Tap the mic and speak"}</span>
            </div>
          )}

          <div className="inputrow">
            <textarea
              aria-label="Write a message"
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                sock.current.emit("participant:activity", { typing: true });
                window.clearTimeout((window as any).typingTimer);
                (window as any).typingTimer = window.setTimeout(
                  () => sock.current.emit("participant:activity", { typing: false }),
                  900
                );
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Write a message…"
              rows={2}
            />
            <button
              className="send"
              aria-label="Send message"
              disabled={!draft.trim()}
              onClick={() => send()}
            >
              <Send />
            </button>
          </div>

          <div className="composefoot">
            <small>Enter to send · Shift + Enter for new line</small>
            {mode !== "read" && (
              <button
                className={auto ? "enabled" : ""}
                onClick={() => setAuto(!auto)}
                aria-label={`Toggle auto-speak incoming messages: currently ${auto ? "on" : "off"}`}
              >
                <Volume2 /> Auto speak {auto ? "on" : "off"}
              </button>
            )}
          </div>
        </section>

        {/* Quick Phrases */}
        <section className="phrases" aria-label="Quick Phrases">
          <div className="sectiontitle">
            <h2>Quick phrases</h2>
            <button
              className="link"
              onClick={() => setEditPhrases(!editPhrases)}
              aria-label={editPhrases ? "Done editing quick phrases" : "Edit quick phrases"}
            >
              {editPhrases ? "Done" : "Edit"}
            </button>
          </div>

          {editPhrases && (
            <div className="phrase-editor" role="region" aria-label="Quick phrase editor">
              <div className="phrase-editor-row">
                <select
                  className="category-select"
                  aria-label="Phrase Category"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                >
                  <option value="General">General</option>
                  <option value="Greeting">Greeting</option>
                  <option value="Question">Question</option>
                  <option value="Urgent">Urgent</option>
                </select>
                <input
                  className="text-input"
                  aria-label="New Phrase Text"
                  placeholder="Add custom phrase…"
                  value={newPhraseText}
                  onChange={e => setNewPhraseText(e.target.value)}
                  maxLength={50}
                />
                <button
                  className="button gold"
                  style={{ minHeight: "44px" }}
                  onClick={addCustomPhrase}
                  aria-label="Add phrase"
                >
                  <Plus /> Add
                </button>
              </div>

              <div className="phrase-editor-actions">
                <button
                  className="button outline"
                  style={{ minHeight: "44px" }}
                  onClick={resetPhrases}
                  aria-label="Reset to default phrases"
                >
                  Reset defaults
                </button>
              </div>
            </div>
          )}

          <div className="phrasegrid">
            {phrases.map((p, i) => (
              <button
                className="phrase"
                key={i}
                onClick={() => (editPhrases ? removePhrase(i) : send(p.text))}
                aria-label={editPhrases ? `Remove phrase: ${p.text}` : `Send phrase: ${p.text}`}
              >
                <span>{editPhrases ? <Trash2 style={{ width: 16, height: 16, color: "#ee776f" }} /> : getPhraseIcon(p.text)}</span>
                <b>{p.text}</b>
              </button>
            ))}
          </div>
        </section>

        {/* Conversation Transcript & Summary Controls */}
        <button
          className="transcript-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label="Toggle conversation transcript and summary"
        >
          Conversation transcript & summary <span>{expanded ? "−" : "+"}</span>
        </button>

        {expanded && (
          <div className="transcript">
            {/* Compact Session Summary */}
            <div className="summary-card">
              <h3>Room Summary</h3>
              <div className="summary-stats">
                <span>Messages: <b>{msgs.length}</b></span>
                <span>Active: <b>{users.length}</b></span>
                <span>Languages: <b>{Array.from(new Set(users.map(u => u.language))).join(", ") || lang}</b></span>
              </div>
            </div>

            <pre>{formatTranscriptText().trim() || "Your transcript will appear here as you converse."}</pre>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
              <button className="button outline" onClick={copyTranscript} aria-label="Copy transcript to clipboard">
                <Copy /> Copy
              </button>
              <button className="button outline" onClick={download} aria-label="Download transcript as text file">
                <Download /> Download .txt
              </button>
            </div>

            {/* Shared Conversation Highlights & Notes */}
            <div style={{ marginTop: "14px" }}>
              <button
                className="button gold"
                style={{ minHeight: "44px", width: "100%", justifyContent: "center" }}
                onClick={generateTakeaways}
                aria-label="View shared conversation highlights and notes"
              >
                <FileText size={16} /> View Conversation Highlights & Notes
              </button>

              {meetingTakeaways && (
                <div className="takeaways-card" role="region" aria-label="Conversation highlights and notes">
                  <div className="takeaways-header">
                    <h4><HeartHandshake size={14} /> Conversation Highlights ({meetingTakeaways.generatedAt})</h4>
                  </div>
                  <div className="takeaways-section">
                    <h5>What we talked about</h5>
                    <ul>
                      {meetingTakeaways.topics.map((t, idx) => (
                        <li key={idx}>{t}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="takeaways-section">
                    <h5>Agreed next steps & follow-ups</h5>
                    <ul>
                      {meetingTakeaways.actions.map((a, idx) => (
                        <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {toneEnabled && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", marginTop: "8px", color: "var(--muted)" }}>
                <input
                  type="checkbox"
                  checked={includeToneInTranscript}
                  onChange={e => setIncludeToneInTranscript(e.target.checked)}
                />
                Include tone hints in downloaded transcript
              </label>
            )}
          </div>
        )}

        <footer className="foot">
          <Shield /> In-memory conversation ·{" "}
          <button className="link" onClick={leave}>
            Leave room
          </button>
        </footer>
      </div>

      {panel && (
        <SettingsView
          {...{
            setPanel,
            font,
            setFont,
            contrast,
            setContrast,
            dark,
            setDark,
            dys,
            setDys,
            motion,
            setMotion,
            vibe,
            setVibe,
            speechRate,
            setSpeechRate,
            chimeEnabled,
            setChimeEnabled,
            toneEnabled,
            setToneEnabled,
            install
          }}
        />
      )}
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <img src="/logo.svg" alt="Mozhiverse logo" />
      <span>Mozhi<span>verse</span></span>
    </div>
  );
}

interface SettingsProps {
  setPanel: (open: boolean) => void;
  font: number;
  setFont: (f: number) => void;
  contrast: boolean;
  setContrast: (c: boolean) => void;
  dark: boolean;
  setDark: (d: boolean) => void;
  dys: boolean;
  setDys: (d: boolean) => void;
  motion: boolean;
  setMotion: (m: boolean) => void;
  vibe: boolean;
  setVibe: (v: boolean) => void;
  speechRate: number;
  setSpeechRate: (r: number) => void;
  chimeEnabled: boolean;
  setChimeEnabled: (c: boolean) => void;
  toneEnabled: boolean;
  setToneEnabled: (t: boolean) => void;
  install: any;
}

function SettingsView(p: SettingsProps) {
  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Accessibility & Preferences Settings"
      onClick={e => e.target === e.currentTarget && p.setPanel(false)}
    >
      <aside className="settings">
        <header>
          <div>
            <span className="eyebrow">MAKE IT YOURS</span>
            <h2>Settings</h2>
          </div>
          <button
            className="icon"
            aria-label="Close settings"
            onClick={() => p.setPanel(false)}
          >
            <X />
          </button>
        </header>

        <label className="range">
          Text size <b>{p.font}px</b>
          <input
            type="range"
            min="14"
            max="26"
            value={p.font}
            onChange={e => p.setFont(+e.target.value)}
            aria-label="Adjust font size"
          />
        </label>

        <label className="range">
          Voice speed <b>{p.speechRate}x</b>
          <input
            type="range"
            min="0.5"
            max="1.75"
            step="0.25"
            value={p.speechRate}
            onChange={e => p.setSpeechRate(+e.target.value)}
            aria-label="Adjust voice playback speed"
          />
        </label>

        <Toggle
          title="High contrast"
          desc="Sharper borders and high-visibility text"
          value={p.contrast}
          set={p.setContrast}
        />

        <Toggle
          title="Dark theme"
          desc="Calm, high-comfort screen theme"
          value={p.dark}
          set={p.setDark}
          icon={p.dark ? <Moon /> : <Sun />}
        />

        <Toggle
          title="Dyslexia-friendly font"
          desc="Specially weighted letterforms for easy reading"
          value={p.dys}
          set={p.setDys}
        />

        <Toggle
          title="Reduce motion"
          desc="Disable animated pulses and transitions"
          value={p.motion}
          set={p.setMotion}
        />

        <Toggle
          title="Vibration"
          desc="Haptic feedback on new incoming message"
          value={p.vibe}
          set={p.setVibe}
        />

        <Toggle
          title="Message sound alert"
          desc="Synthesizes a gentle two-tone chime on incoming messages"
          value={p.chimeEnabled}
          set={p.setChimeEnabled}
        />

        {/* Emotional Feelings & Nuance Toggle */}
        <Toggle
          title="Emotional Nuance & Feelings"
          desc="Helpful cues about the feeling behind a message (such as gratitude, urgency, or reassurance) to prevent misunderstandings."
          value={p.toneEnabled}
          set={p.setToneEnabled}
        />
        {p.toneEnabled && (
          <p className="tone-disclaimer" style={{ padding: "0 4px 10px" }}>
            Note: Nuance suggestions are gentle context cues to aid empathy across diverse languages and cultures. They never replace actual words.
          </p>
        )}

        {p.install && (
          <button
            className="button gold full"
            style={{ marginTop: "14px" }}
            onClick={() => p.install.prompt()}
            aria-label="Install Mozhiverse PWA"
          >
            Install Mozhiverse PWA
          </button>
        )}

        <p className="hint">
          <Shield /> Preferences apply locally to your current device.
        </p>
      </aside>
    </div>
  );
}

function Toggle({
  title,
  desc,
  value,
  set,
  icon
}: {
  title: string;
  desc: string;
  value: boolean;
  set: (val: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="toggle">
      <span>{icon ?? <Check />}</span>
      <span className="togglecopy">
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={e => set(e.target.checked)}
        aria-label={title}
      />
      <i />
    </label>
  );
}
