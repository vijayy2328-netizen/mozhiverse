"""
translation_engine.py
Multi-provider translation engine with caching and fallback mechanisms.
Supports English, Tamil, Hindi, Spanish, French, German, Japanese, Chinese, etc.
"""

import logging
import asyncio
from typing import Dict, Optional
from deep_translator import GoogleTranslator, MyMemoryTranslator

logger = logging.getLogger("OmniBridge.Translation")

# Language code normalization map
LANG_MAP = {
    "en": "en-US",
    "ta": "ta-IN",
    "hi": "hi-IN",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
    "ja": "ja-JP",
    "zh": "zh-CN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN"
}

# Reverse mapping for base codes
BASE_LANGS = {
    "en-us": "en",
    "en-gb": "en",
    "en": "en",
    "ta-in": "ta",
    "ta": "ta",
    "hi-in": "hi",
    "hi": "hi",
    "es-es": "es",
    "es": "es",
    "fr-fr": "fr",
    "fr": "fr",
    "de-de": "de",
    "de": "de",
    "ja-jp": "ja",
    "ja": "ja",
    "zh-cn": "zh",
    "zh": "zh",
    "te-in": "te",
    "te": "te",
    "kn-in": "kn",
    "kn": "kn",
    "ml-in": "ml",
    "ml": "ml"
}

# Curated instant conversational dictionary for zero-latency instant translation during hackathon demos
CONVERSATIONAL_DICT = {
    ("ta", "en"): {
        "வணக்கம்": "Hello",
        "வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?": "Hello, how are you?",
        "நான் நலமாக இருக்கிறேன், நன்றி": "I am doing well, thank you",
        "நீங்கள் என்னை கேட்க முடிகிறதா?": "Can you hear me?",
        "ஆம், நான் உங்களை கேட்க முடிகிறது": "Yes, I can hear you clearly",
        "இல்லை, தயவுசெய்து மீண்டும் சொல்லுங்கள்": "No, please repeat that",
        "ஒரு நிமிடம் காத்திருங்கள்": "Wait a minute please",
        "எனக்கு புரிகிறது": "I understand",
        "நான் ஒப்புக்கொள்கிறேன்": "I agree",
        "நன்றி": "Thank you",
        "விடைபெறுகிறேன்": "Goodbye",
        "தயவுசெய்து காத்திருங்கள், நான் தட்டச்சு செய்கிறேன்": "Please wait, I am typing",
        "என்னால் பேச முடியாது, ஆனால் கேட்க முடிகிறது": "I cannot speak, but I can hear you",
        "இந்த சந்திப்பு பயனுள்ளதாக உள்ளது": "This meeting is very helpful"
    },
    ("en", "ta"): {
        "hello": "வணக்கம்",
        "hi": "வணக்கம்",
        "hello, how are you?": "வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?",
        "how are you?": "நீங்கள் எப்படி இருக்கிறீர்கள்?",
        "i am doing well, thank you": "நான் நலமாக இருக்கிறேன், நன்றி",
        "can you hear me?": "நீங்கள் என்னை கேட்க முடிகிறதா?",
        "yes, i can hear you": "ஆம், நான் உங்களை கேட்க முடிகிறது",
        "yes, i can hear you clearly": "ஆம், நான் உங்களை தெளிவாக கேட்க முடிகிறது",
        "yes": "ஆம்",
        "no": "இல்லை",
        "please repeat": "தயவுசெய்து மீண்டும் சொல்லுங்கள்",
        "wait a moment, i am typing": "ஒரு நிமிடம் காத்திருங்கள், நான் தட்டச்சு செய்கிறேன்",
        "wait a moment": "ஒரு நிமிடம் காத்திருங்கள்",
        "i agree": "நான் ஒப்புக்கொள்கிறேன்",
        "thank you": "நன்றி",
        "goodbye": "விடைபெறுகிறேன்",
        "i cannot speak, but i can hear you clearly": "என்னால் பேச முடியாது, ஆனால் உங்களை தெளிவாக கேட்க முடிகிறது",
        "how can i help today?": "இன்று நான் எப்படி உதவ முடியும்?",
        "welcome to our meeting": "எங்கள் சந்திப்புக்கு வரவேற்கிறோம்"
    },
    ("hi", "en"): {
        "नमस्ते": "Hello",
        "आप कैसे हैं?": "How are you?",
        "हाँ": "Yes",
        "नहीं": "No",
        "धन्यवाद": "Thank you",
        "क्या आप मुझे सुन सकते हैं?": "Can you hear me?"
    },
    ("en", "hi"): {
        "hello": "नमस्ते",
        "how are you?": "आप कैसे हैं?",
        "yes": "हाँ",
        "no": "नहीं",
        "thank you": "धन्यवाद",
        "can you hear me?": "क्या आप मुझे सुन सकते हैं?"
    }
}

class TranslationEngine:
    def __init__(self):
        self._cache: Dict[str, str] = {}
        self.lock = asyncio.Lock()

    def _normalize_lang(self, lang: str) -> str:
        if not lang:
            return "en"
        return BASE_LANGS.get(lang.lower().strip(), lang[:2].lower())

    def _get_cache_key(self, text: str, src: str, tgt: str) -> str:
        return f"{src.lower()}:{tgt.lower()}:{text.strip().lower()}"

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """
        Translates text from source_lang to target_lang.
        If source_lang == target_lang, returns original text.
        Checks cache -> Checks quick phrasebook -> MyMemory -> GoogleTranslator fallback -> Original on failure.
        """
        if not text or not text.strip():
            return ""

        src = self._normalize_lang(source_lang)
        tgt = self._normalize_lang(target_lang)

        if src == tgt:
            return text

        cache_key = self._get_cache_key(text, src, tgt)
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Check instant dictionary
        dict_pair = (src, tgt)
        clean_query = text.strip().lower().rstrip(".?!,")
        if dict_pair in CONVERSATIONAL_DICT:
            for phrase, translation in CONVERSATIONAL_DICT[dict_pair].items():
                if phrase.lower().rstrip(".?!,") == clean_query:
                    self._cache[cache_key] = translation
                    return translation

        # Perform translation in thread pool to keep asyncio event loop responsive
        loop = asyncio.get_running_loop()
        translated = await loop.run_in_executor(None, self._sync_translate, text, src, tgt)

        if translated:
            self._cache[cache_key] = translated
            return translated

        return text

    def _sync_translate(self, text: str, src: str, tgt: str) -> str:
        # Provider 1: MyMemory (very reliable for Tamil, Hindi, European languages)
        try:
            # MyMemory uses RFC 3066 or ISO 639-1
            src_mymemory = LANG_MAP.get(src, src)
            tgt_mymemory = LANG_MAP.get(tgt, tgt)
            result = MyMemoryTranslator(source=src_mymemory, target=tgt_mymemory).translate(text)
            if result and not result.startswith("MYMEMORY WARNING"):
                return result
        except Exception as e:
            logger.warning(f"MyMemory translation failed: {e}")

        # Provider 2: GoogleTranslator fallback
        try:
            result = GoogleTranslator(source=src, target=tgt).translate(text)
            if result:
                return result
        except Exception as e:
            logger.warning(f"GoogleTranslator fallback failed: {e}")

        # Return original text if translation fails
        return text

# Global singleton
translator = TranslationEngine()
