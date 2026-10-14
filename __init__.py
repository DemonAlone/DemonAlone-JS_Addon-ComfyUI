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
from .DA_AnySwitch import DA_AnySwitch
from .image_comparer import DA_ImageComparer
from .civitai_save import DA_SaveImage
from .DynamicSliderNode import DA_DynamicSliderNode

NODE_CLASS_MAPPINGS = {
    "DA_AnySwitch": DA_AnySwitch,
    "DA_DynamicSliderNode": DA_DynamicSliderNode,
    "DA_ImageComparer": DA_ImageComparer,
    "DA_GroupController": DA_GroupController,
    "DA_NodeController": DA_NodeController,
    "DA_PlaySound": DA_PlaySound,
    "DA_PromptFormatter": DA_PromptFormatter,
    "DA_ResolutionSelector": DA_ResolutionSelector,
    "DA_SaveImage": DA_SaveImage,   
    "LoadVideoNode": LoadVideoNode,
    "LoadVideoNodes2": LoadVideoNodes2,
    "PresetFloatNode": PresetFloatNode,
    "PresetIntNode": PresetIntNode,
    "SimpleLoopController": SimpleLoopController,
    "VideoMakerV2": VideoMakerV2, 
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DA_AnySwitch": "DA_AnySwitch",
    "DA_DynamicSliderNode": "Dynamic Slider",
    "DA_ImageComparer": "Image Comparer",
    "DA_GroupController": "DA_GroupController [BETA]",
    "DA_NodeController": "DA_NodeController [BETA]",
    "DA_PlaySound": "DA_PlaySound",
    "DA_PromptFormatter": "Prompt Formatter",
    "DA_ResolutionSelector": "Resolution Selector [BETA]",
    "DA_SaveImage": "Save Image (Civitai Metadata)",
    "LoadVideoNode": "Load Video [BETA]",
    "LoadVideoNodes2": "Load Video (for Nodes 2.0) [BETA]",
    "PresetFloatNode": "Preset Float [DEPRECATED]",
    "PresetIntNode": "Preset Int [DEPRECATED]",
    "SimpleLoopController": "Simple Loop Controller [BETA]",
    "VideoMakerV2": "Video Maker V2 [BETA]",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']