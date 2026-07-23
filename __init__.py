from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode
from .play_sound import DA_PlaySound

NODE_CLASS_MAPPINGS = {
    "VideoMakerNode": VideoMakerNode,
	"LoadVideoNode": LoadVideoNode,
    "DA_PlaySound": DA_PlaySound,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VideoMakerNode": "Video Maker (Beta)",
	"LoadVideoNode": "Load Video (Beta)",
    "DA_PlaySound": "DA_PlaySound (Beta)",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']