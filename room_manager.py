"""
room_manager.py
Manages live conversation rooms, participant modalities, turn sequencing,
interruption detection, and per-participant translation dispatching.
"""

import asyncio
import time
import logging
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from fastapi import WebSocket
from translation_engine import translator

logger = logging.getLogger("OmniBridge.RoomManager")

class ParticipantProfile(BaseModel):
    client_id: str
    name: str
    language: str = "en"               # "ta", "en", "hi", "es", "fr", etc.
    input_modality: str = "both"       # "speech", "text", "both"
    output_modality: str = "both"     # "audio", "captions", "both"
    is_speaking: bool = False
    is_typing: bool = False
    has_hand_raised: bool = False
    avatar: str = "👤"

class MessageRecord(BaseModel):
    seq_id: int
    turn_id: str
    sender_id: str
    sender_name: str
    sender_lang: str
    input_modality: str
    original_text: str
    translations: Dict[str, str] = Field(default_factory=dict) # lang -> translated_text
    timestamp: float = Field(default_factory=time.time)
    is_aac: bool = False

class ParticipantConnection:
    def __init__(self, websocket: WebSocket, profile: ParticipantProfile):
        self.websocket = websocket
        self.profile = profile

class ConversationRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.participants: Dict[str, ParticipantConnection] = {}
        self.seq_counter: int = 0
        self.transcript: List[MessageRecord] = []
        self.current_speaker_id: Optional[str] = None
        self.lock = asyncio.Lock()

    def get_participants_list(self) -> List[Dict[str, Any]]:
        return [p.profile.model_dump() for p in self.participants.values()]

    async def add_participant(self, websocket: WebSocket, profile: ParticipantProfile):
        async with self.lock:
            self.participants[profile.client_id] = ParticipantConnection(websocket, profile)

        # Broadcast participant join
        await self.broadcast({
            "type": "participant_joined",
            "participant": profile.model_dump(),
            "participants": self.get_participants_list()
        })

    async def remove_participant(self, client_id: str):
        async with self.lock:
            if client_id in self.participants:
                name = self.participants[client_id].profile.name
                del self.participants[client_id]
                if self.current_speaker_id == client_id:
                    self.current_speaker_id = None
                
                await self.broadcast({
                    "type": "participant_left",
                    "client_id": client_id,
                    "name": name,
                    "participants": self.get_participants_list()
                })

    async def update_profile(self, client_id: str, updates: Dict[str, Any]):
        async with self.lock:
            if client_id not in self.participants:
                return
            p = self.participants[client_id].profile
            for key, val in updates.items():
                if hasattr(p, key):
                    setattr(p, key, val)
        
        await self.broadcast({
            "type": "participant_updated",
            "participant": self.participants[client_id].profile.model_dump(),
            "participants": self.get_participants_list()
        })

    async def broadcast(self, payload: Dict[str, Any], exclude_client: Optional[str] = None):
        """Broadcasts a raw message to all connected clients."""
        disconnected = []
        for cid, conn in self.participants.items():
            if exclude_client and cid == exclude_client:
                continue
            try:
                await conn.websocket.send_json(payload)
            except Exception as e:
                logger.warning(f"Error sending to {cid}: {e}")
                disconnected.append(cid)
        
        for cid in disconnected:
            await self.remove_participant(cid)

    async def handle_activity(self, client_id: str, activity_type: str, is_active: bool):
        """
        Handles 'speaking' or 'typing' indicators, detects interruptions.
        """
        if client_id not in self.participants:
            return
        
        sender = self.participants[client_id].profile
        interruption_detected = False

        if activity_type == "speaking":
            sender.is_speaking = is_active
            if is_active:
                # Interruption check: If another participant was marked as current speaker
                if self.current_speaker_id and self.current_speaker_id != client_id:
                    interruption_detected = True
                self.current_speaker_id = client_id
            else:
                if self.current_speaker_id == client_id:
                    self.current_speaker_id = None

        elif activity_type == "typing":
            sender.is_typing = is_active

        elif activity_type == "hand_raise":
            sender.has_hand_raised = is_active

        # Broadcast state
        await self.broadcast({
            "type": "activity_update",
            "client_id": client_id,
            "sender_name": sender.name,
            "activity": activity_type,
            "is_active": is_active,
            "interruption": interruption_detected,
            "participants": self.get_participants_list()
        })

    async def handle_interim_speech(self, client_id: str, turn_id: str, text: str):
        """
        Streams interim/partial speech recognition results to room.
        Differentiates incomplete speech from final statements.
        """
        if client_id not in self.participants or not text.strip():
            return
        sender = self.participants[client_id].profile
        await self.broadcast({
            "type": "interim_speech",
            "client_id": client_id,
            "sender_name": sender.name,
            "sender_lang": sender.language,
            "turn_id": turn_id,
            "text": text
        }, exclude_client=client_id)

    async def post_message(
        self,
        sender_id: str,
        text: str,
        input_modality: str,
        turn_id: Optional[str] = None,
        is_aac: bool = False
    ) -> MessageRecord:
        """
        Dispatches a finalized statement (speech or typed text).
        Assigns canonical sequence ID, translates concurrently to each unique target language,
        and broadcasts tailored payloads respecting each recipient's output modality.
        """
        if sender_id not in self.participants:
            raise ValueError("Sender not in room")

        sender = self.participants[sender_id].profile
        turn_id = turn_id or f"turn_{int(time.time() * 1000)}"

        async with self.lock:
            self.seq_counter += 1
            seq = self.seq_counter
            # Reset speaking state
            sender.is_speaking = False
            if self.current_speaker_id == sender_id:
                self.current_speaker_id = None

        # Determine all target languages needed in this room
        target_languages = set(conn.profile.language for conn in self.participants.values())
        translations: Dict[str, str] = {sender.language: text}

        # Concurrently translate for all distinct languages needed
        tasks = []
        needed_langs = [tgt for tgt in target_languages if tgt != sender.language]

        async def _do_translate(tgt: str):
            res = await translator.translate(text, sender.language, tgt)
            return tgt, res

        for tgt in needed_langs:
            tasks.append(_do_translate(tgt))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if isinstance(res, tuple):
                    tgt, trans = res
                    translations[tgt] = trans

        record = MessageRecord(
            seq_id=seq,
            turn_id=turn_id,
            sender_id=sender_id,
            sender_name=sender.name,
            sender_lang=sender.language,
            input_modality=input_modality,
            original_text=text,
            translations=translations,
            timestamp=time.time(),
            is_aac=is_aac
        )

        async with self.lock:
            self.transcript.append(record)
            if len(self.transcript) > 100:
                self.transcript.pop(0)

        # Dispatch tailored message to each participant
        for cid, conn in self.participants.items():
            user_profile = conn.profile
            recipient_lang = user_profile.language
            translated_text = translations.get(recipient_lang, text)

            is_self = (cid == sender_id)
            # Decide whether this participant should hear TTS audio
            should_play_audio = False
            if not is_self:
                if user_profile.output_modality in ("audio", "both"):
                    should_play_audio = True

            # Decide whether this participant should see captions/text
            should_show_captions = True
            if not is_self and user_profile.output_modality == "audio":
                # Audio only users still receive the text in transcript, but caption banner can be tuned
                should_show_captions = True

            payload = {
                "type": "message",
                "seq_id": record.seq_id,
                "turn_id": record.turn_id,
                "sender_id": sender_id,
                "sender_name": sender.name,
                "sender_avatar": sender.avatar,
                "sender_lang": sender.language,
                "recipient_lang": recipient_lang,
                "original_text": text,
                "display_text": translated_text,
                "is_self": is_self,
                "input_modality": input_modality,
                "is_aac": is_aac,
                "should_play_audio": should_play_audio,
                "should_show_captions": should_show_captions,
                "timestamp": record.timestamp
            }

            try:
                await conn.websocket.send_json(payload)
            except Exception as e:
                logger.warning(f"Failed to send message to {cid}: {e}")

        return record


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, ConversationRoom] = {}
        self.lock = asyncio.Lock()

    async def get_or_create_room(self, room_id: str) -> ConversationRoom:
        async with self.lock:
            if room_id not in self.rooms:
                self.rooms[room_id] = ConversationRoom(room_id)
            return self.rooms[room_id]

    async def cleanup_room_if_empty(self, room_id: str):
        async with self.lock:
            if room_id in self.rooms and len(self.rooms[room_id].participants) == 0:
                del self.rooms[room_id]

# Global room manager
room_manager = RoomManager()
