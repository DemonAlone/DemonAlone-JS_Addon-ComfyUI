from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound
from .PresetFloat import PresetFloatNode
from .PresetInt import PresetIntNode
from .LoopController import SimpleLoopController
from .prompt_formatter import DA_PromptFormatter
from .NodeController import DA_NodeController
from .GroupController import DA_GroupController

NODE_CLASS_MAPPINGS = {
    "DA_GroupController": DA_GroupController,
    "DA_PlaySound": DA_PlaySound,
    "DA_PromptFormatter": DA_PromptFormatter,
    "DA_NodeController": DA_NodeController,
    "LoadVideoNode": LoadVideoNode,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "SimpleLoopController": SimpleLoopController,
    "VideoMakerNode": VideoMakerNode,  
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_GroupController": "DA_GroupController [BETA]",
    "DA_PlaySound": "DA_PlaySound",
    "DA_PromptFormatter": "Prompt Formatter",
    "DA_NodeController": "DA_NodeController [BETA]",
    "LoadVideoNode": "Load Video [BETA]",
    "PresetFloatNode": "Preset Float [BETA]",
    "PresetIntNode": "Preset Int [BETA]",
    "SimpleLoopController": "Simple Loop Controller [BETA]",
    "VideoMakerNode": "Video Maker [BETA]",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']