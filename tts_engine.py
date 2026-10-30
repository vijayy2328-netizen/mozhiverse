"""
tts_engine.py
High-performance, low-latency neural Text-to-Speech engine for Mozhiverse.
Powered by edge-tts with in-memory streaming and phrase caching.
"""

import io
import asyncio
import base64
import logging
from typing import Optional, Dict

logger = logging.getLogger("Mozhiverse.TTS")

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    logger.warning("edge-tts not installed; falling back to client-side speech synthesis")

# Recommended natural neural voices by language code
VOICE_MAP: Dict[str, str] = {
    "en": "en-US-JennyNeural",
    "en-US": "en-US-JennyNeural",
    "en-GB": "en-GB-SoniaNeural",
    "ta": "ta-IN-PallaviNeural",
    "hi": "hi-IN-SwaraNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "ja": "ja-JP-NanamiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "te": "te-IN-ShrutiNeural",
    "kn": "kn-IN-SapnaNeural",
    "ml": "ml-IN-SobhanaNeural"
}

# In-memory LRU cache for frequent accessibility phrases
_AUDIO_CACHE: Dict[str, str] = {}
_MAX_CACHE_SIZE = 256

class TTSEngine:
    def __init__(self):
        self.available = EDGE_TTS_AVAILABLE

    def get_voice_for_language(self, lang_code: str, voice_pref: Optional[str] = None) -> str:
        if voice_pref:
            return voice_pref
        lang_short = lang_code.split("-")[0].lower() if lang_code else "en"
        return VOICE_MAP.get(lang_short, "en-US-JennyNeural")

    async def synthesize_to_base64(self, text: str, lang: str = "en", voice: Optional[str] = None) -> Optional[str]:
        """
        Synthesize text to base64-encoded MP3 data URI for instant web playback.
        Returns None if synthesis fails.
        """
        clean_text = text.strip()
        if not clean_text:
            return None

        chosen_voice = self.get_voice_for_language(lang, voice)
        cache_key = f"{chosen_voice}:{clean_text}"

        if cache_key in _AUDIO_CACHE:
            return _AUDIO_CACHE[cache_key]

        if not self.available:
            return None

        try:
            communicate = edge_tts.Communicate(clean_text, chosen_voice)
            audio_buffer = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.extend(chunk["data"])

            if not audio_buffer:
                return None

            b64_audio = base64.b64encode(audio_buffer).decode("ascii")
            data_uri = f"data:audio/mp3;base64,{b64_audio}"

            # Cache phrase
            if len(_AUDIO_CACHE) >= _MAX_CACHE_SIZE:
                _AUDIO_CACHE.pop(next(iter(_AUDIO_CACHE)))
            _AUDIO_CACHE[cache_key] = data_uri

            return data_uri
        except Exception as e:
            logger.error(f"TTS synthesis error for '{clean_text[:30]}...': {e}")
            return None

tts_engine = TTSEngine()
