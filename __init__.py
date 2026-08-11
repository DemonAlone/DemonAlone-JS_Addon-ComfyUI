from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound
from .PresetFloat import PresetFloatNode
from .PresetInt import PresetIntNode
from .LoopController import SimpleLoopController
from .prompt_formatter import DA_PromptFormatter

NODE_CLASS_MAPPINGS = {
    "DA_PlaySound": DA_PlaySound,
    "LoadVideoNode": LoadVideoNode,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "VideoMakerNode": VideoMakerNode,  
    "SimpleLoopController": SimpleLoopController,
    "DA_PromptFormatter": DA_PromptFormatter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_PlaySound": "DA_PlaySound",
    "LoadVideoNode": "LoadVideoNode [Beta]",
    "PresetFloatNode": "PresetFloatNode [BETA]",
    "PresetIntNode": "PresetIntNode [BETA]",
    "VideoMakerNode": "VideoMakerNode [BETA]",
    "SimpleLoopController": "Simple Loop Controller [BETA]",
    "DA_PromptFormatter": "Prompt Formatter [BETA]",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']