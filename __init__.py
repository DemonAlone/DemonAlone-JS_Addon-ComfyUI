from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound
from .PresetFloat import PresetFloatNode

NODE_CLASS_MAPPINGS = {
    "DA_PlaySound": DA_PlaySound,
    "LoadVideoNode": LoadVideoNode,
    "PresetFloatNode": PresetFloatNode,
    "VideoMakerNode": VideoMakerNode,   
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_PlaySound": "DA_PlaySound (Beta)",
    "LoadVideoNode": "LoadVideoNode (Beta)",
    "PresetFloatNode": "PresetFloatNode (Beta)",
    "VideoMakerNode": "VideoMakerNode (Beta)", 
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']