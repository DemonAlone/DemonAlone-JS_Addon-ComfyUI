from .civitai_save import DA_SaveImage
from .da_anyswitch import DA_AnySwitch
from .dynamic_slider_node import DA_DynamicSliderNode
from .group_controller import DA_GroupController
from .image_comparer import DA_ImageComparer
from .load_video import LoadVideoNode
from .load_video_nodes2 import LoadVideoNodes2
from .loop_controller import SimpleLoopController
from .node_controller import DA_NodeController
from .play_sound import DA_PlaySound
from .preset_float import PresetFloatNode
from .preset_int import PresetIntNode
from .prompt_formatter import DA_PromptFormatter
from .resolution_selector import DA_ResolutionSelector
from .video_maker_v2 import VideoMakerV2

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