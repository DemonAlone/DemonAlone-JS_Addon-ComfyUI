from .videomaker import VideoMakerNode
from .load_video import LoadVideoNode

NODE_CLASS_MAPPINGS = {
    "VideoMakerNode": VideoMakerNode,
	"LoadVideoNode": LoadVideoNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VideoMakerNode": "Video Maker (Beta)",
	"LoadVideoNode": "Load Video (Beta)",
}

WEB_DIRECTORY = "./web"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']