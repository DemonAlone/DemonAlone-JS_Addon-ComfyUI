import numpy as np
import io
import os
import uuid
import struct
import wave
import server
from PIL import Image
from aiohttp import web
from server import PromptServer
import asyncio
import glob
import time
import datetime
import folder_paths


_frame_cache = {}
_audio_cache = {}

# ---------- Endpoints ----------
@PromptServer.instance.routes.get("/customvideo/meta")
async def get_meta(request):
    sid = request.query.get("id")
    if sid not in _frame_cache:
        return web.Response(status=404)
    meta = _frame_cache[sid]
    return web.json_response({
        "fps": meta["fps"],
        "width": meta["width"],   
        "height": meta["height"],
        "filename": meta.get("filename", "video.mp4"),
        "audio_available": sid in _audio_cache,
        "trim_audio": meta.get("trim_audio", False)
    })

@PromptServer.instance.routes.get("/customvideo/frames")
async def get_frames(request):
    sid = request.query.get("id")
    if sid not in _frame_cache:
        return web.Response(status=404)
    
    meta = _frame_cache[sid]
    frames_data = meta["frames"]
    total_frames = len(frames_data)
    
	# Streaming packed frames
    # Format: [num_frames (4B)] + [frame_size_1 (4B) + frame_data_1] + [frame_size_2 (4B) + frame_data_2]...
    header = struct.pack("!I", total_frames)
    
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "application/octet-stream"
    await resp.prepare(request)
    await resp.write(header)
    
    for frame_bytes in frames_data:
        frame_header = struct.pack("!I", len(frame_bytes))
        await resp.write(frame_header + frame_bytes)
        
    return resp

@PromptServer.instance.routes.get("/customvideo/audio")
async def get_audio(request):
    sid = request.query.get("id")
    audio_path = _audio_cache.pop(sid, None)
    if not audio_path or not os.path.exists(audio_path):
        return web.Response(status=404)
    resp = web.FileResponse(audio_path)
    # Remove file after 5 seconds (enough for transfer)
    async def delayed_remove():
        await asyncio.sleep(5)
        try:
            os.remove(audio_path)
        except OSError:
            pass
    asyncio.ensure_future(delayed_remove())
    return resp

@PromptServer.instance.routes.post("/customvideo/save")
async def save_video(request):
    data = await request.post()
    file_field = data.get("file")
    filename = data.get("filename", "video.mp4")
    
    output_dir = folder_paths.get_output_directory()
    
    # Add .mp4 extension if missing
    if not filename.lower().endswith(".mp4"):
        filename = f"{filename}.mp4"

    safe_name = os.path.normpath(filename).lstrip("/").lstrip("\\")
    if os.path.isabs(safe_name) or safe_name.startswith(".."):
        return web.json_response({"error": "Invalid filename"}, status=400)
    
    full_path = os.path.join(output_dir, safe_name)
    # Create subfolders if they don't exist
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    # Protection against overwriting (increment in next point)
    name, ext = os.path.splitext(full_path)
    counter = 1
    while os.path.exists(full_path):
        full_path = f"{name}_{counter:02d}{ext}"
        counter += 1
    
    with open(full_path, "wb") as f:
        f.write(file_field.file.read())
    
    relative = os.path.relpath(full_path, output_dir).replace("\\", "/")
    return web.json_response({"path": relative})

class VideoMakerNode:
    NODE_NAME = "VideoMakerNode"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 0.01}),
                "trim_audio": ("BOOLEAN", {"default": True, "label": "Trim audio to video length"})
            },
            "optional": {
                "filename": ("STRING", {"default": "video", "tooltip": "Relative path inside `output`. Use %date% for date."}), # Default is just 'video', extension added automatically
                "use_date_mask": ("BOOLEAN", {"default": False, "label_on": "Custom Date", "label_off": "Default Date"}),
                "custom_date_format": ("STRING", {"default": "yyyy-mm-dd", "tooltip": "Date format if custom mask is enabled (e.g., yyyy, dd-mm-yyyy)"}),
                "audio": ("AUDIO",)   
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("last_frame",)
    FUNCTION = "make_video"
    CATEGORY = "video"
    DESCRIPTION = "This node generates MP4 videos from image batches with optional audio support, saving the result directly to your output folder. Its unique preview scaling automatically fits the video frame to the node's canvas size rather than stretching it, ensuring better workflow control. You can also trim audio to match video length, but be aware that the audio bitrate is capped at 192K."
    OUTPUT_NODE = True


    def make_video(self, images, fps, trim_audio, audio=None, filename="video", use_date_mask=False, custom_date_format="yyyy-mm-dd"):
        session_id = str(uuid.uuid4())
        
        # Convert frames to JPEG
        frames_png = []
        for img in images:
            img_np = (img.cpu().numpy() * 255).astype(np.uint8)
            pil_img = Image.fromarray(img_np)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=90)
            frames_png.append(buf.getvalue())
            
        # --- Date Logic Added ---
        current_date = datetime.datetime.now()
        date_str = current_date.strftime("%Y-%m-%d")
        
        # Initialize custom_format before checking
        if use_date_mask:
            year = str(current_date.year).zfill(4)
            month = str(current_date.month).zfill(2)
            day = str(current_date.day).zfill(2)
            date_str = custom_date_format.replace("yyyy", year).replace("mm", month).replace("dd", day)
        
        # Replace %date% in the file name if necessary
        if "%date%" in filename:
            filename = filename.replace("%date%", date_str)
			
        _frame_cache[session_id] = {
            "width": images[0].shape[1],
            "height": images[0].shape[0],
            "fps": fps,
            "filename": filename,
            "frames": frames_png,
            "trim_audio": trim_audio,
            "use_date_mask": use_date_mask,
            "custom_date_format": custom_date_format
        }
        # --- End Date Logic ---
        
        # Audio
        if audio is not None and "waveform" in audio:
            waveform = audio["waveform"].cpu().numpy()
            sample_rate = audio["sample_rate"]
            
            # Convert to standard view (channels, samples)
            if waveform.ndim == 3 and waveform.shape[0] == 1:
                waveform = waveform.squeeze(0)
            if waveform.ndim == 2:
                channels = waveform.shape[0]
                samples = waveform.shape[1]
            elif waveform.ndim == 1:
                channels = 1
                samples = waveform.shape[0]
                waveform = waveform.reshape(1, -1)
            else:
                raise ValueError(f"Unexpected audio shape: {waveform.shape}")
            
            # Check and logging (for debugging)
            print(f"[VideoMaker] AUDIO: channels={channels}, samples={samples}, sample_rate={sample_rate}, duration={samples/sample_rate:.3f}с")              
            # Create WAV in memory
            wav_buf = io.BytesIO()
            with wave.open(wav_buf, "wb") as wf:
                wf.setnchannels(channels)
                wf.setsampwidth(2) # 16-bit
                wf.setframerate(sample_rate)
                # Scale to int16
                audio_int16 = (waveform * 32767).astype(np.int16)
                # For multi-channel audio, rearrange to interleaved format (samples, channels)
                if channels > 1:
                    audio_int16 = audio_int16.transpose(1, 0).reshape(-1)
                wf.writeframes(audio_int16.tobytes())
            
            # Save to temporary file
            tmp_dir = os.path.join(os.path.dirname(__file__), "temp")
            os.makedirs(tmp_dir, exist_ok=True)
            # Cleanup old files
            for old_file in glob.glob(os.path.join(tmp_dir, "_tmp_*.wav")):
                if time.time() - os.path.getmtime(old_file) > 3600:
                    try:
                        os.remove(old_file)
                    except OSError:
                        pass
            tmp_path = os.path.join(tmp_dir, f"_tmp_{session_id}.wav")
            with open(tmp_path, "wb") as f:
                f.write(wav_buf.getvalue())
            _audio_cache[session_id] = tmp_path
            
        server.PromptServer.instance.send_sync(
            "video_maker_ready", 
            {"session_id": session_id}
        )
        
        last_frame = images[-1].unsqueeze(0)
        return (last_frame,)
