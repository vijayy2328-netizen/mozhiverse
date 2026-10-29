import type { Language } from "@mozhiverse/shared";

export interface TranslationProvider {
  translate(text: string, source: Language, target: Language): Promise<string>;
}

const code: Record<Language, string> = {
  Tamil: "ta",
  English: "en",
  Hindi: "hi",
  Telugu: "te",
  Malayalam: "ml",
  Kannada: "kn"
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export class GoogleProvider implements TranslationProvider {
  constructor(private key: string) {}

  async translate(text: string, source: Language, target: Language): Promise<string> {
    const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${this.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: code[source],
        target: code[target],
        format: "text"
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error(`Google Translate returned ${r.status}`);
    const j = await r.json() as { data?: { translations?: { translatedText: string }[] } };
    const out = j.data?.translations?.[0]?.translatedText;
    if (!out) throw new Error("Empty Google translation");
    return decodeHtmlEntities(out);
  }
}

export class MyMemoryProvider implements TranslationProvider {
  async translate(text: string, source: Language, target: Language): Promise<string> {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${code[source]}|${code[target]}`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error(`MyMemory returned ${r.status}`);
    const j = await r.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
    const out = j.responseData?.translatedText;
    if (!out || j.responseStatus !== 200) throw new Error("Translation unavailable");
    return decodeHtmlEntities(out);
  }
}

export class CachedTranslator {
  private cache = new Map<string, string>();
  constructor(private provider: TranslationProvider) {}

  async translate(text: string, source: Language, target: Language): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed || source === target) return text;
    const key = `${source}:${target}:${trimmed.toLowerCase()}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const result = await this.provider.translate(trimmed, source, target);
    this.cache.set(key, result);
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    return result;
  }
}
