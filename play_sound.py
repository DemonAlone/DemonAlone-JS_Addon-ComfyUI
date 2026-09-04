# DA_Playsound is based on PlaySound 🐍 from [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) by pythongosssss
import os
import time

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
                "duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 10.0, "step": 0.1, "tooltip": "Max playback duration in seconds. 0.0 = unlimited"}),
            },
            "optional": {
                "any_input": ("*", {}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "play_sound"
    CATEGORY = "utils"
    DESCRIPTION = "This utility node triggers audio playback whenever the workflow executes this specific step. Includes a duration limit."
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return time.time()

    def play_sound(self, volume, play_only_when_queue_empty, audio_file, duration, any_input=None, **kwargs):
        should_play = True
        
        if play_only_when_queue_empty:
            try:
                from server import PromptServer
                if PromptServer.instance and hasattr(PromptServer.instance, 'prompt_queue'):
                    # Receive current tasks from the server's internal memory without network requests
                    queue_running, queue_pending = PromptServer.instance.prompt_queue.get_current_queue()
                    # If there are tasks in the pending queue besides the current one
                    if len(queue_pending) > 0:
                        should_play = False
            except Exception as e:
                # If in the future the internal API changes and the method fails - 
                # log the error, but do not disable generation for the user
                print(f"[DA_PlaySound] Internal queue check warning: {e}")

        ui_data = {}
        if should_play:
            ui_span = {
                "file": audio_file,
                "volume": volume,
                "duration": duration
            }
            ui_data = {"da_play_audio": [ui_span]}
            print(f"[DA_PlaySound] Sending JS playback signal: {audio_file}")
        
        return {"ui": ui_data, "result": (any_input,)}