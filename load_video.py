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


# Endpoint for instant metadata retrieval without frame decoding
@PromptServer.instance.routes.get("/get_video_metadata")
async def get_video_metadata(request):
    filename = request.query.get("file")
    if not filename:
        return web.Response(status=400, text="Missing file parameter")
    
    safe_path = os.path.abspath(os.path.join(video_input_folder, filename))
    if not safe_path.startswith(os.path.abspath(video_input_folder)):
        return web.Response(status=403, text="Forbidden")
    if not os.path.exists(safe_path):
        return web.Response(status=404, text="File not found")

    try:
        container = av.open(safe_path)
        video_stream = next((s for s in container.streams if s.type == 'video'), None)
        
        if video_stream is None:
            container.close()
            return web.json_response({"error": "No video stream found"}, status=400)

        # Accurate FPS from container metadata
        fps = float(video_stream.average_rate) if video_stream.average_rate else 25.0
        
        # Exact number of frames from titles
        frame_count = video_stream.frames
        if not frame_count or frame_count <= 0:
            # # For WebM, compute frame count by duration of the stream
            if video_stream.duration and video_stream.time_base:
                frame_count = int(float(video_stream.duration * video_stream.time_base) * fps)
            elif container.duration:
                # Total container duration in microseconds (AV_TIME_BASE = 1000000)
                frame_count = int((container.duration / 1000000.0) * fps)
            else:
                frame_count = 0

        container.close()
        return web.json_response({"fps": fps, "frame_count": frame_count})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

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
                "max_frames": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1, "tooltip": "0 = all"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "INT")
    RETURN_NAMES = ("frames", "audio", "fps", "frame_count")  # frame_count is now the actual number of frames loaded
    FUNCTION = "load_video"
    CATEGORY = "video"
    DESCRIPTION = "Directly load videos into ComfyUI via drag-and-drop or button upload (MP4, AVI, MOV, MKV, WebM). Outputs frames as an IMAGE batch and extracts audio, FPS, and frame count metadata. The 'max_frames' parameter limits the number of frames loaded (0 = all). The output 'frame_count' reflects the actual number of frames loaded (after cropping). Features a built-in preview player with real-time display of resolution, FPS, and total frame count."
    OUTPUT_NODE = False    # normal node, not output
    OUTPUT_TOOLTIPS = (
        "Batch of video frames as images (torch.Tensor) [N, H, W, C]",
        "Dictionary with 'waveform' and 'sample_rate', or None if no audio",
        "Frames per second of the video (float)",
        "Actual number of frames loaded, respecting the 'max_frames' limit"
    )
    def load_video(self, video, max_frames):
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

        frame_count_loaded = 0
        # Decode until we reach max_frames (if max_frames != 0)
        for packet in container.demux():
            if packet.stream.type == 'video':
                for frame in packet.decode():
                    img = frame.to_image()
                    img_np = np.array(img).astype(np.float32) / 255.0
                    frames.append(img_np)
                    frame_count_loaded += 1
                    # If limit reached, break inner loop
                    if max_frames != 0 and frame_count_loaded >= max_frames:
                        break
                # If limit reached, break outer loop (demux)
                if max_frames != 0 and frame_count_loaded >= max_frames:
                    break
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

        return (frames_tensor, audio_dict, original_fps, frame_count_loaded)