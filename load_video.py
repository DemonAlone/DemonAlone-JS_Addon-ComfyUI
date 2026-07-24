import os
import folder_paths
import torch
import numpy as np
import av
from server import PromptServer
from aiohttp import web
import mimetypes
import shutil

# Video folder (created automatically)
video_input_folder = folder_paths.get_input_directory() # root input

# drag-and-drop
@PromptServer.instance.routes.post("/uploadvideo")
async def upload_video(request):
    data = await request.post()
    file = data.get("file")
    if not file:
        return web.Response(status=400, text="No file uploaded")
    
    filename = file.filename
    # root input
    safe_filename = os.path.basename(filename)
    dest_path = os.path.join(video_input_folder, safe_filename)
    
    # If file exists - overwrite
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    return web.json_response({"name": safe_filename})
# Endpoint for serving video files (preview)
@PromptServer.instance.routes.get("/inputvideo")
async def serve_input_video(request):
    filename = request.query.get("file")
    if not filename:
        return web.Response(status=400, text="Missing file parameter")
    # Security: check path is within folder
    safe_path = os.path.abspath(os.path.join(video_input_folder, filename))
    if not safe_path.startswith(os.path.abspath(video_input_folder)):
        return web.Response(status=403, text="Forbidden")
    if not os.path.exists(safe_path):
        return web.Response(status=404, text="File not found")
    # Determine mime-type
    mime_type, _ = mimetypes.guess_type(safe_path)
    if not mime_type:
        mime_type = "video/mp4"
    return web.FileResponse(safe_path, headers={"Content-Type": mime_type})

class LoadVideoNode:
    @classmethod
    def INPUT_TYPES(cls):
        supported_ext = ('.mp4', '.avi', '.mov', '.mkv', '.webm')
        files = []
        if os.path.exists(video_input_folder):
            for f in os.listdir(video_input_folder):
                if f.lower().endswith(supported_ext):
                    files.append(f)
        if not files:
            files = ["No video files found"]
        return {
            "required": {
                "video": (files,),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "INT")
    RETURN_NAMES = ("frames", "audio", "fps", "frame_count")
    FUNCTION = "load_video"
    CATEGORY = "video"
    DESCRIPTION = "This node enables direct video loading and preview within ComfyUI without relying on external file paths or disk storage. It features a built-in upload system that accepts common formats like MP4, AVI, and MOV directly via drag-and-drop or the interface button. Upon loading, it automatically extracts video frames into an IMAGE batch while simultaneously retrieving audio streams, FPS, and frame count metadata. "
    OUTPUT_NODE = False    # normal node, not output

    def load_video(self, video):
        video_path = os.path.join(video_input_folder, video)
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        container = av.open(video_path)
        video_stream = next((s for s in container.streams if s.type == 'video'), None)
        audio_stream = next((s for s in container.streams if s.type == 'audio'), None)

        if video_stream is None:
            raise RuntimeError("No video stream found.")
        original_fps = float(video_stream.average_rate) if video_stream.average_rate else 25.0

        frames = []
        audio_frames = []
        sample_rate = audio_stream.sample_rate if audio_stream else None
        audio_channels = audio_stream.channels if audio_stream else None

        for packet in container.demux():
            if packet.stream.type == 'video':
                for frame in packet.decode():
                    img = frame.to_image()
                    img_np = np.array(img).astype(np.float32) / 255.0
                    frames.append(img_np)
            elif packet.stream.type == 'audio' and audio_stream is not None:
                for frame in packet.decode():
                    audio_data = frame.to_ndarray()
                    if audio_data.ndim == 1:
                        audio_data = audio_data.reshape(1, -1)
                    else:
                        if audio_data.shape[0] != audio_channels:
                            audio_data = audio_data.transpose(1, 0)
                    audio_frames.append(audio_data)

        container.close()

        if not frames:
            raise RuntimeError("No frames extracted.")

        frames_tensor = torch.from_numpy(np.stack(frames, axis=0)).float()

        audio_dict = None
        if audio_frames:
            audio_concat = np.concatenate(audio_frames, axis=1).astype(np.float32)
            audio_dict = {
                "waveform": torch.from_numpy(audio_concat).float().unsqueeze(0),  # added batch dim
                "sample_rate": sample_rate,
            }

        return (frames_tensor, audio_dict, original_fps, len(frames))