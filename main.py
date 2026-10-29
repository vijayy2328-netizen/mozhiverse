"""
main.py
FastAPI server powering Mozhiverse (மொழிverse): Universal Multimodal, Multilingual Accessible Live Voice & Text Bridge.
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from translation_engine import translator
from room_manager import room_manager, ParticipantProfile

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("Mozhiverse.Server")

app = FastAPI(
    title="Mozhiverse",
    description="Universal Multimodal, Multilingual Accessible Live Voice & Text Bridge",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "native": "English", "flag": "🇺🇸"},
    {"code": "ta", "name": "Tamil", "native": "தமிழ்", "flag": "🇮🇳"},
    {"code": "hi", "name": "Hindi", "native": "हिन्दी", "flag": "🇮🇳"},
    {"code": "es", "name": "Spanish", "native": "Español", "flag": "🇪🇸"},
    {"code": "fr", "name": "French", "native": "Français", "flag": "🇫🇷"},
    {"code": "de", "name": "German", "native": "Deutsch", "flag": "🇩🇪"},
    {"code": "ja", "name": "Japanese", "native": "日本語", "flag": "🇯🇵"},
    {"code": "zh", "name": "Chinese", "native": "中文", "flag": "🇨🇳"},
    {"code": "te", "name": "Telugu", "native": "తెలుగు", "flag": "🇮🇳"},
    {"code": "kn", "name": "Kannada", "native": "ಕನ್ನಡ", "flag": "🇮🇳"},
    {"code": "ml", "name": "Malayalam", "native": "മലയാളം", "flag": "🇮🇳"}
]

class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

@app.get("/api/languages")
async def get_languages():
    return {"languages": SUPPORTED_LANGUAGES}

@app.post("/api/translate")
async def translate_text(req: TranslateRequest):
    translated = await translator.translate(req.text, req.source_lang, req.target_lang)
    return {
        "original_text": req.text,
        "source_lang": req.source_lang,
        "target_lang": req.target_lang,
        "translated_text": translated
    }

@app.get("/api/rooms")
async def get_rooms():
    rooms_data = []
    for rid, room in room_manager.rooms.items():
        rooms_data.append({
            "room_id": rid,
            "participants_count": len(room.participants),
            "participants": room.get_participants_list()
        })
    return {"rooms": rooms_data}

@app.get("/api/rooms/{room_id}/transcript")
async def get_transcript(room_id: str):
    if room_id not in room_manager.rooms:
        return {"transcript": []}
    room = room_manager.rooms[room_id]
    return {
        "room_id": room_id,
        "transcript": [m.model_dump() for m in room.transcript]
    }

@app.websocket("/ws/room/{room_id}/{client_id}")
async def websocket_room_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await websocket.accept()
    room = await room_manager.get_or_create_room(room_id)
    participant_registered = False

    try:
        # First message expected is participant registration/handshake
        handshake_data = await websocket.receive_json()
        if handshake_data.get("type") != "register":
            profile = ParticipantProfile(
                client_id=client_id,
                name=f"User-{client_id[:4]}",
                language="en",
                input_modality="both",
                output_modality="both"
            )
        else:
            profile = ParticipantProfile(
                client_id=client_id,
                name=handshake_data.get("name", f"User-{client_id[:4]}"),
                language=handshake_data.get("language", "en"),
                input_modality=handshake_data.get("input_modality", "both"),
                output_modality=handshake_data.get("output_modality", "both"),
                avatar=handshake_data.get("avatar", "👤")
            )

        await room.add_participant(websocket, profile)
        participant_registered = True

        # Send room state and history
        await websocket.send_json({
            "type": "welcome",
            "room_id": room_id,
            "profile": profile.model_dump(),
            "participants": room.get_participants_list(),
            "transcript": [m.model_dump() for m in room.transcript[-20:]]
        })

        # Main message processing loop
        while True:
            data = await websocket.receive_json()
            action = data.get("type")

            if action == "ping":
                await websocket.send_json({"type": "pong"})

            elif action == "update_profile":
                updates = data.get("updates", {})
                await room.update_profile(client_id, updates)

            elif action == "activity":
                # { "type": "activity", "activity": "speaking"|"typing"|"hand_raise", "is_active": True/False }
                activity = data.get("activity")
                is_active = bool(data.get("is_active", False))
                await room.handle_activity(client_id, activity, is_active)

            elif action == "interim_speech":
                # Live streaming speech recognition hypotheses
                turn_id = data.get("turn_id", "")
                text = data.get("text", "")
                await room.handle_interim_speech(client_id, turn_id, text)

            elif action == "message":
                # Finalized message (speech-to-text or typed)
                text = data.get("text", "").strip()
                if text:
                    input_modality = data.get("input_modality", "speech")
                    turn_id = data.get("turn_id")
                    is_aac = bool(data.get("is_aac", False))
                    await room.post_message(
                        sender_id=client_id,
                        text=text,
                        input_modality=input_modality,
                        turn_id=turn_id,
                        is_aac=is_aac
                    )

            elif action == "cancel_audio":
                # Barge-in interruption signal: notify all peers to cancel ongoing speech playback
                await room.broadcast({
                    "type": "cancel_audio",
                    "sender_id": client_id,
                    "sender_name": profile.name
                })

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {client_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    finally:
        if participant_registered:
            await room.remove_participant(client_id)
            await room_manager.cleanup_room_if_empty(room_id)

# Mount static folder
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/style.css")
async def get_style():
    style_file = os.path.join(static_dir, "style.css")
    if os.path.exists(style_file):
        return FileResponse(style_file, media_type="text/css")
    raise HTTPException(status_code=404)

@app.get("/app.js")
async def get_app_js():
    js_file = os.path.join(static_dir, "app.js")
    if os.path.exists(js_file):
        return FileResponse(js_file, media_type="application/javascript")
    raise HTTPException(status_code=404)

@app.get("/")
async def root():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "OmniBridge API is running. Place index.html in /static"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
