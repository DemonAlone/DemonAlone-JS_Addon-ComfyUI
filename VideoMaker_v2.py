import os
import uuid
import datetime
import torch
import numpy as np
import folder_paths
import av

class VideoMakerV2:
    NODE_NAME = "VideoMakerV2"
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 60.0, "step": 0.01}),
                "trim_audio": ("BOOLEAN", {"default": True, "label": "Trim audio to video length"})
            },
            "optional": {
                "filename": ("STRING", {"default": "video", "tooltip": "Relative path inside `output`. Use %date% for date."}),
                "use_date_mask": ("BOOLEAN", {"default": False, "label_on": "Custom Date", "label_off": "Default Date"}),
                "custom_date_format": ("STRING", {"default": "yyyy-mm-dd", "tooltip": "Date format if custom mask is enabled"}),
                "audio": ("AUDIO",)   
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("last_frame",)
    FUNCTION = "make_video"
    CATEGORY = "video"
    OUTPUT_NODE = True
    DESCRIPTION = (
            "Generates MP4 videos from image batches with server-side PyAV encoding, supporting high audio bitrates and reliable background processing."
    )

    def make_video(self, images, fps, trim_audio, audio=None, filename="video", use_date_mask=False, custom_date_format="yyyy-mm-dd"):
        output_dir = folder_paths.get_output_directory()
        
        # --- Date Logic ---
        current_date = datetime.datetime.now()
        date_str = current_date.strftime("%Y-%m-%d")
        
        if use_date_mask:
            year = str(current_date.year).zfill(4)
            month = str(current_date.month).zfill(2)
            day = str(current_date.day).zfill(2)
            date_str = custom_date_format.replace("yyyy", year).replace("mm", month).replace("dd", day)
        
        if "%date%" in filename:
            filename = filename.replace("%date%", date_str)

        if not filename.lower().endswith(".mp4"):
            filename = f"{filename}.mp4"

        safe_name = os.path.normpath(filename).lstrip("/").lstrip("\\")
        if os.path.isabs(safe_name) or safe_name.startswith(".."):
            safe_name = "video.mp4"
        
        full_path = os.path.join(output_dir, safe_name)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Prevent overwriting
        name, ext = os.path.splitext(full_path)
        counter = 1
        while os.path.exists(full_path):
            full_path = f"{name}_{counter:02d}{ext}"
            counter += 1

        # --- PyAV Encoding Setup ---
        height, width = images.shape[1], images.shape[2]
        
        # Ensure dimensions are even (required for many h264 profiles)
        enc_width = width if width % 2 == 0 else width - 1
        enc_height = height if height % 2 == 0 else height - 1

        container = av.open(full_path, mode="w")
        
        # Video stream setup
        video_stream = container.add_stream("libx264", rate=int(fps))
        video_stream.width = enc_width
        video_stream.height = enc_height
        video_stream.pix_fmt = "yuv420p"
        video_stream.options = {"crf": "18", "preset": "medium"}

        # Audio stream setup (if provided)
        audio_stream = None
        audio_data_np = None
        sample_rate = 44100
        channels = 2
        
        if audio is not None and "waveform" in audio:
            waveform = audio["waveform"].cpu().numpy()
            sample_rate = audio["sample_rate"]
            
            if waveform.ndim == 3 and waveform.shape[0] == 1:
                waveform = waveform.squeeze(0)
            if waveform.ndim == 2:
                # ComfyUI format: [channels, samples]
                pass
            elif waveform.ndim == 1:
                waveform = waveform.reshape(1, -1)
                
            channels = waveform.shape[0]
            
            # Trimming audio to video length if requested
            video_duration = len(images) / fps
            audio_duration = waveform.shape[1] / sample_rate
            if trim_audio and audio_duration > video_duration:
                max_samples = int(video_duration * sample_rate)
                waveform = waveform[:, :max_samples]

            audio_data_np = waveform
            
            audio_stream = container.add_stream("aac", rate=sample_rate)
            # Set the layout correctly via a string instead of directly assigning channels
            audio_stream.layout = "stereo" if channels == 2 else "mono"
            audio_stream.bit_rate = 320000

        # --- Writing Video Frames ---
        for img_tensor in images:
            img_np = (img_tensor.cpu().numpy() * 255).astype(np.uint8)
            
            # Resize/crop if dimensions were adjusted to even numbers
            if img_np.shape[0] != enc_height or img_np.shape[1] != enc_width:
                img_np = img_np[:enc_height, :enc_width]

            frame = av.VideoFrame.from_ndarray(img_np, format="rgb24")
            for packet in video_stream.encode(frame):
                container.mux(packet)

        # Flush video encoder
        for packet in video_stream.encode():
            container.mux(packet)

        # --- Writing Audio Frames ---
        if audio_stream is not None and audio_data_np is not None:
            total_samples = audio_data_np.shape[1]
            chunk_size = 1024
            layout_str = "stereo" if channels == 2 else "mono"
            
            for i in range(0, total_samples, chunk_size):
                chunk = audio_data_np[:, i:i + chunk_size]
                current_chunk_samples = chunk.shape[1]
                
                if current_chunk_samples < chunk_size:
                    padded = np.zeros((channels, chunk_size), dtype=np.float32)
                    padded[:, :current_chunk_samples] = chunk
                    chunk = padded
                    samples_to_encode = chunk_size
                else:
                    samples_to_encode = current_chunk_samples

                chunk_int16 = (chunk * 32767).astype(np.int16)
                
                # Creating an audio frame via the standard constructor and populating the memory buffer with bytes
                audio_frame = av.AudioFrame(format="s16", layout=layout_str, samples=samples_to_encode)
                audio_frame.sample_rate = sample_rate
                
                # Writing the interleaved array into the first plane's buffer
                interleaved_bytes = chunk_int16.T.tobytes()
                audio_frame.planes[0].update(interleaved_bytes)
                for packet in audio_stream.encode(audio_frame):
                    container.mux(packet)

            # Flush audio encoder
            for packet in audio_stream.encode():
                container.mux(packet)

        container.close()
        
        relative_path = os.path.relpath(full_path, output_dir).replace("\\", "/")
        print(f"[VideoMakerV2] Video successfully rendered on server: {relative_path}")

        last_frame = images[-1].unsqueeze(0)
        
        # Returning via the ComfyUI UI dictionary — this ensures that the message 
        # will arrive strictly at the node that was currently being executed, and not to any other!
        return {
            "ui": {
                "filename": [relative_path]
            },
            "result": (last_frame,)
        }