from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound
from .PresetFloat import PresetFloatNode
from .PresetInt import PresetIntNode
from .LoopController import SimpleLoopController

NODE_CLASS_MAPPINGS = {
    "DA_PlaySound": DA_PlaySound,
    "LoadVideoNode": LoadVideoNode,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "VideoMakerNode": VideoMakerNode,  
    "SimpleLoopController": SimpleLoopController,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_PlaySound": "DA_PlaySound",
    "LoadVideoNode": "LoadVideoNode (Beta)",
    "PresetFloatNode": "PresetFloatNode (Beta)",
    "PresetIntNode": "PresetIntNode (Beta)",
    "VideoMakerNode": "VideoMakerNode (Beta)",
    "SimpleLoopController": "Simple Loop Controller (testing)",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']