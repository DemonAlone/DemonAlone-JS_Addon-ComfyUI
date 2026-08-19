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
    "DA_PlaySound": DA_PlaySound,
    "LoadVideoNode": LoadVideoNode,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "VideoMakerNode": VideoMakerNode,  
    "SimpleLoopController": SimpleLoopController,
    "DA_PromptFormatter": DA_PromptFormatter,
    "DA_NodeController": DA_NodeController,
    "DA_GroupController": DA_GroupController,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_PlaySound": "DA_PlaySound",
    "LoadVideoNode": "Load Video [BETA]",
    "PresetFloatNode": "Preset Float [BETA]",
    "PresetIntNode": "Preset Int [BETA]",
    "VideoMakerNode": "Video Maker [BETA]",
    "SimpleLoopController": "Simple Loop Controller [BETA]",
    "DA_PromptFormatter": "Prompt Formatter",
    "DA_NodeController": "Node Controller [BETA]",
    "DA_GroupController": "Group Controller [BETA]",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']