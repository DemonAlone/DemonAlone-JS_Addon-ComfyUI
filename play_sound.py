# DA_Playsound is based on PlaySound 🐍 from [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) by pythongosssss
import json
import urllib.request
import os
import time

_cached_port = None

def get_server_port():
    global _cached_port
    if _cached_port is not None:
        return _cached_port
    port = 8188
    try:
        from server import PromptServer
        if PromptServer.instance and hasattr(PromptServer.instance, 'port'):
            port = PromptServer.instance.port
    except Exception:
        pass
    _cached_port = port
    return port

def get_audio_files():
    current_dir = os.path.dirname(os.path.realpath(__file__))
    web_dir = os.path.join(current_dir, "web")
    valid_extensions = ('.mp3', '.wav', '.ogg', '.flac')
    files = ["default.mp3"]
    if os.path.exists(web_dir):
        for f in os.listdir(web_dir):
           # Check the extension and exclude the script itself play_sound.js
            if f.lower().endswith(valid_extensions) and f not in files:
                files.append(f)
    return files

class DA_PlaySound:
    @classmethod
    def INPUT_TYPES(cls):
        audio_list = get_audio_files()
        return {
            "required": {
                "volume": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "play_only_when_queue_empty": ("BOOLEAN", {"default": False}),
                "audio_file": (audio_list, {"default": audio_list[0], "tooltip": "Place your .mp3/.wav/.ogg/.flac files in custom_nodes/demonalone-js_addon-comfyui/web folder"},),
            },
            "optional": {
                "any_input": ("*", {}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "play_sound"
    CATEGORY = "utils"
    DESCRIPTION = "This utility node triggers audio playback whenever the workflow executes this specific step. You can specify the sound file path from the extension's web folder and adjust the volume level easily. The system includes an option to play sounds only when the generation queue is empty, preventing interruptions during processing. Audio files are cached in browser memory to avoid repeated downloads for subsequent executions."
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return time.time()

    def play_sound(self, volume, play_only_when_queue_empty, audio_file, any_input=None, **kwargs):
        should_play = True
        
        if play_only_when_queue_empty:
            try:
                port = get_server_port()
                url = f"http://127.0.0.1:{port}/api/jobs?status=in_progress,pending&limit=200&offset=0"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=2) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode('utf-8'))
                        total_jobs = data.get('pagination', {}).get('total', 0)
                        if total_jobs > 1:
                            should_play = False
            except Exception as e:
                print(f"[DA_PlaySound] Error checking queue: {e}")
                should_play = False

        # If play is needed, pass the signal and file name to the frontend via UI.
        ui_data = {}
        if should_play:
            ui_span = {
                "file": audio_file,
                "volume": volume
            }
            ui_data = {"da_play_audio": [ui_span]}
            print(f"[DA_PlaySound] Sending JS playback signal: {audio_file}")
        
        return {"ui": ui_data, "result": (any_input,)}