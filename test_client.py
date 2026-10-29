"""
test_client.py
Automated end-to-end multi-participant verification script for Mozhiverse (மொழிverse).
Simulates 3 participants concurrently interacting across modalities and languages:
  1. Anand (Tamil Speaker, Speech Input, Audio Output)
  2. Sarah (Hard of Hearing, Hybrid Input, Captions Output)
  3. Liam (Non-verbal, AAC/Text Input, Both Output)
"""

import asyncio
import json
import websockets
import sys

SERVER_URI = "ws://127.0.0.1:8000/ws/room/demo-room"

async def participant_agent(client_id: str, name: str, lang: str, in_modality: str, out_modality: str, script_actions: list, stop_event: asyncio.Event):
    uri = f"{SERVER_URI}/{client_id}"
    print(f"[{name}] Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as ws:
            # 1. Registration handshake
            await ws.send(json.dumps({
                "type": "register",
                "name": name,
                "language": lang,
                "input_modality": in_modality,
                "output_modality": out_modality,
                "avatar": "👤"
            }))
            print(f"[{name}] Registered with Lang={lang}, In={in_modality}, Out={out_modality}")

            # Receiver task
            async def receiver():
                try:
                    async for raw in ws:
                        msg = json.loads(raw)
                        mtype = msg.get("type")
                        if mtype == "message":
                            sender = msg.get("sender_name")
                            orig = msg.get("original_text")
                            disp = msg.get("display_text")
                            s_lang = msg.get("sender_lang")
                            r_lang = msg.get("recipient_lang")
                            audio = msg.get("should_play_audio")
                            capt = msg.get("should_show_captions")
                            print(f"\n💬 [{name} Received Turn #{msg.get('seq_id')} from {sender}]:")
                            print(f"    Original ({s_lang}): \"{orig}\"")
                            print(f"    Translated ({r_lang}): \"{disp}\"")
                            print(f"    Modality Action -> AudioTTS={audio}, SubtitlesCC={capt}")
                        elif mtype == "interim_speech":
                            pass # stream updates
                        elif mtype == "activity_update":
                            act = msg.get("activity")
                            act_by = msg.get("sender_name")
                            inter = msg.get("interruption")
                            if inter:
                                print(f"⚠️  [{name} Alert]: Interruption detected from {act_by}!")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"[{name} Receiver Error]: {e}")

            rec_task = asyncio.create_task(receiver())

            # Perform scheduled actions
            for act in script_actions:
                delay = act.get("delay", 1.0)
                await asyncio.sleep(delay)
                act_type = act.get("type")

                if act_type == "speak":
                    await ws.send(json.dumps({"type": "activity", "activity": "speaking", "is_active": True}))
                    await asyncio.sleep(0.5)
                    await ws.send(json.dumps({"type": "interim_speech", "text": act.get("text")[:10] + "..."}))
                    await asyncio.sleep(0.5)
                    await ws.send(json.dumps({
                        "type": "message",
                        "text": act.get("text"),
                        "input_modality": "speech",
                        "turn_id": f"turn_{int(asyncio.get_event_loop().time() * 1000)}"
                    }))
                    print(f"🎙️  [{name} Spoke]: \"{act.get('text')}\"")

                elif act_type == "type":
                    await ws.send(json.dumps({"type": "activity", "activity": "typing", "is_active": True}))
                    await asyncio.sleep(0.5)
                    await ws.send(json.dumps({
                        "type": "message",
                        "text": act.get("text"),
                        "input_modality": "text",
                        "turn_id": f"turn_{int(asyncio.get_event_loop().time() * 1000)}",
                        "is_aac": act.get("is_aac", False)
                    }))
                    print(f"⌨️  [{name} Typed]: \"{act.get('text')}\" (AAC={act.get('is_aac', False)})")

            await stop_event.wait()
            rec_task.cancel()
    except Exception as e:
        print(f"[{name} Connection Error]: {e}")

async def main():
    print("=" * 65)
    print("  Mozhiverse (மொழிverse) Live 3-Way Multimodal Simulation")
    print("=" * 65)

    stop_event = asyncio.Event()

    # Anand actions
    anand_actions = [
        {"delay": 1.0, "type": "speak", "text": "வணக்கம்! நீங்கள் என்னை கேட்க முடிகிறதா?"}
    ]

    # Sarah actions
    sarah_actions = [
        {"delay": 3.0, "type": "type", "text": "Yes Anand, I can read your speech captions clearly in English."}
    ]

    # Liam actions (Non-verbal, AAC + Typed response)
    liam_actions = [
        {"delay": 5.0, "type": "type", "text": "Please wait a moment, I am typing my response", "is_aac": True},
        {"delay": 7.0, "type": "type", "text": "I cannot speak, but I hear you both and typed this."}
    ]

    tasks = [
        asyncio.create_task(participant_agent("client_anand", "Anand", "ta", "speech", "audio", anand_actions, stop_event)),
        asyncio.create_task(participant_agent("client_sarah", "Sarah", "en", "both", "captions", sarah_actions, stop_event)),
        asyncio.create_task(participant_agent("client_liam", "Liam", "en", "text", "both", liam_actions, stop_event))
    ]

    await asyncio.sleep(10.0)
    stop_event.set()
    await asyncio.gather(*tasks)

    print("\n✅ Simulation completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
