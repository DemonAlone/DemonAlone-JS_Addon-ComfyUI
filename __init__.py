from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound
from .PresetFloat import PresetFloatNode
from .PresetInt import PresetIntNode
from .LoopController import SimpleLoopController
from .prompt_formatter import DA_PromptFormatter
from .NodeController import DA_NodeController
from .GroupController import DA_GroupController
from .VideoMaker_v2 import VideoMakerV2
from .load_video_nodes2 import LoadVideoNodes2
from .ResolutionSelector import DA_ResolutionSelector

NODE_CLASS_MAPPINGS = {
    "DA_GroupController": DA_GroupController,
    "DA_NodeController": DA_NodeController,
    "DA_PlaySound": DA_PlaySound,
    "DA_PromptFormatter": DA_PromptFormatter,
    "LoadVideoNode": LoadVideoNode,
    "LoadVideoNodes2": LoadVideoNodes2,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "DA_ResolutionSelector": DA_ResolutionSelector,
    "VideoMakerNode": VideoMakerNode,
    "VideoMakerV2": VideoMakerV2,      
    "SimpleLoopController": SimpleLoopController,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_GroupController": "DA_GroupController [BETA]",
    "DA_NodeController": "DA_NodeController [BETA]",
    "DA_PlaySound": "DA_PlaySound",
    "DA_PromptFormatter": "Prompt Formatter",
    "LoadVideoNode": "Load Video [BETA]",
    "LoadVideoNodes2": "Load Video (Nodes 2.0 only) [BETA]",
    "PresetFloatNode": "Preset Float [BETA]",
    "PresetIntNode": "Preset Int [BETA]",
    "DA_ResolutionSelector": "Resolution Selector [BETA]",
    "VideoMakerNode": "Video Maker [DEPRECATED]",
    "VideoMakerV2": "Video Maker V2 [BETA]",
    "SimpleLoopController": "Simple Loop Controller [BETA]",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']