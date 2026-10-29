export const LANGUAGES = {
  Tamil: "ta-IN",
  English: "en-US",
  Hindi: "hi-IN",
  Telugu: "te-IN",
  Malayalam: "ml-IN",
  Kannada: "kn-IN"
} as const;

export type Language = keyof typeof LANGUAGES;
export type Mode = "speak" | "type" | "read";

export interface Participant {
  id: string;
  name: string;
  language: Language;
  mode: Mode;
}

export interface ToneHintResult {
  tone: string;
  confidence: "low" | "medium";
  reason: string;
}

export const VALID_REACTIONS = ["like", "love", "smile", "care", "👍", "❤️", "😂", "🫂"] as const;
export type ReactionType = typeof VALID_REACTIONS[number];

export interface ChatMessage {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  sourceLanguage: Language;
  original: string;
  translations: Partial<Record<Language, string>>;
  createdAt: number;
  tone?: ToneHintResult;
  isUrgent?: boolean;
  isSupportive?: boolean;
  reactions?: Partial<Record<ReactionType, string[]>>;
}

export interface RoomSnapshot {
  code: string;
  participants: Participant[];
}

export interface QuickPhrase {
  icon: string;
  text: string;
}

export interface SupportivePhrase {
  icon: string;
  text: string;
  tag: string;
}

export const SUPPORTIVE_WORDS: SupportivePhrase[] = [
  { icon: "presence", text: "I am here with you", tag: "Presence" },
  { icon: "patience", text: "Take your time, no rush", tag: "Patience" },
  { icon: "encouragement", text: "You are doing great, keep going", tag: "Encouragement" },
  { icon: "solidarity", text: "We will solve this together", tag: "Solidarity" },
  { icon: "calm", text: "Take a deep breath, it will be okay", tag: "Calm" },
  { icon: "care", text: "Sending you warmth and positive energy", tag: "Care" }
];

export function isSupportive(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase();
  return (
    SUPPORTIVE_WORDS.some(s => t.includes(s.text.toLowerCase())) ||
    t.includes("here with you") ||
    t.includes("take your time") ||
    t.includes("doing great") ||
    t.includes("solve this together") ||
    t.includes("breathe") ||
    t.includes("positive energy") ||
    t.includes("உங்களுடன்") ||
    t.includes("நேரம் எடு") ||
    t.includes("கவலைப்படாதீர்கள்") ||
    t.includes("साथ हूँ") ||
    t.includes("साथ हैं")
  );
}

export const QUICK_PHRASES: QuickPhrase[] = [
  { icon: "greeting", text: "Hello" },
  { icon: "gratitude", text: "Thank you" },
  { icon: "help", text: "Help" },
  { icon: "yes", text: "Yes" },
  { icon: "no", text: "No" },
  { icon: "repeat", text: "Please repeat" },
  { icon: "speed", text: "Slow down" },
  { icon: "location", text: "Where is the toilet" },
  { icon: "medical", text: "I need a doctor" },
  { icon: "urgent", text: "Emergency" }
];

export const EMERGENCY_PHRASES = [
  "emergency", "help", "sos", "urgent", "doctor", "ambulance", "danger",
  "உதவி", "அவசரம்", "காப்பாற்றுங்கள்", "மருத்துவர்",
  "मदদ", "आपातकाल", "बचाओ", "डॉक्टर",
  "సహాయం", "అత్యవసరం", "వైద్యుడు",
  "സഹായം", "അടിയന്തരം", "ഡോക്ടർ",
  "ಸಹಾಯ", "ತುರ್ತು", "ವೈದ್ಯರು"
];

export function isEmergency(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase();
  return EMERGENCY_PHRASES.some(k => t.includes(k.toLowerCase()));
}

export const TONE_RULES: Array<{
  test: RegExp;
  tone: string;
  confidence: "low" | "medium";
  reason: string;
}> = [
  {
    test: /(!{2,}|\b(angry|frustrated|fed up|annoyed|irritated|hate|upset|கோபம்|எரிச்சல்|क्रोध|గుస్సా)\b)/i,
    tone: "frustrated",
    confidence: "medium",
    reason: "Contains strong exclamation marks or frustration keywords"
  },
  {
    test: /\b(emergency|urgent|help|asap|right now|immediately|உதவி|அவசரம்|मदद|आपातकाल|ತುರ್ತು|అత్యవసరం)\b/i,
    tone: "urgent",
    confidence: "medium",
    reason: "Contains explicit time-sensitive or urgency keywords"
  },
  {
    test: /\b(sad|sorry|unhappy|disappointed|hurt|cry|வருத்தம்|துக்கம்|दुःख|బాధ|ದುಃಖ)\b/i,
    tone: "somber",
    confidence: "low",
    reason: "Contains apologetic or sorrowful vocabulary"
  },
  {
    test: /\b(thank|thanks|great|happy|glad|love|awesome|wonderful|நன்றி|மகிழ்ச்சி|धन्यवाद|ధన్యవాదాలు|നന്ദി|ಧನ್ಯವಾದಗಳು)\b/i,
    tone: "appreciative",
    confidence: "low",
    reason: "Contains positive courtesy or appreciation keywords"
  },
  {
    test: /(\?{2,}|\b(can you|could you|please repeat|slow down|what|why|how|தயவுசெய்து|மீண்டும்|कृपया|ఎలా|ఏమిటి|ಹೇಗೆ)\b)/i,
    tone: "questioning / requesting",
    confidence: "low",
    reason: "Contains inquiry punctuation or polite request wording"
  }
];

export function toneHint(text: string): ToneHintResult | null {
  if (!text || typeof text !== "string") return null;
  for (const rule of TONE_RULES) {
    if (rule.test.test(text)) {
      return { tone: rule.tone, confidence: rule.confidence, reason: rule.reason };
    }
  }
  return null;
}
