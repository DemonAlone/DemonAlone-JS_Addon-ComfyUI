import logging
import mimetypes
import os

import aiofiles
import av
import folder_paths
from aiohttp import web
from server import PromptServer

logger = logging.getLogger(__name__)
video_input_folder = folder_paths.get_input_directory()


@PromptServer.instance.routes.post("/uploadvideo")
async def upload_video(request):
    data = await request.post()
    file = data.get("file")
    if not file:
        return web.Response(status=400, text="No file uploaded")

    safe_filename = os.path.basename(file.filename)
    dest_path = os.path.join(video_input_folder, safe_filename)

    try:
        async with aiofiles.open(dest_path, "wb") as f:
            while True:
                chunk = file.file.read(8192)
                if not chunk:
                    break
                await f.write(chunk)
    except (OSError, ValueError):
        logger.exception("Failed to save uploaded file")
        return web.Response(status=500, text="Failed to save uploaded file")

    return web.json_response({"name": safe_filename})


@PromptServer.instance.routes.get("/get_video_metadata")
async def get_video_metadata(request):
    filename = request.query.get("file")
    if not filename or filename == "None":
        return web.Response(status=400, text="Missing file parameter")

    safe_path = os.path.abspath(os.path.join(video_input_folder, filename))
    if not safe_path.startswith(os.path.abspath(video_input_folder)):
        return web.Response(status=403, text="Forbidden")
    if not os.path.exists(safe_path):
        return web.Response(status=404, text="File not found")

    try:
        container = av.open(safe_path)
        video_stream = next((s for s in container.streams if s.type == "video"), None)

        if video_stream is None:
            container.close()
            return web.json_response({"error": "No video stream found"}, status=400)

        fps = float(video_stream.average_rate) if video_stream.average_rate else 25.0
        frame_count = video_stream.frames
        if not frame_count or frame_count <= 0:
            if video_stream.duration and video_stream.time_base:
                frame_count = int(float(video_stream.duration * video_stream.time_base) * fps)
            elif container.duration:
                frame_count = int((container.duration / 1000000.0) * fps)
            else:
                frame_count = 0

        container.close()
        return web.json_response({"fps": fps, "frame_count": frame_count})
    except Exception:  # noqa: BLE001
        logger.exception("Failed to read video metadata")
        return web.json_response({"error": "Failed to read video metadata"}, status=500)


@PromptServer.instance.routes.get("/inputvideo")
async def serve_input_video(request):
    filename = request.query.get("file")
    if not filename or filename == "None":
        return web.Response(status=400, text="Missing file parameter")

    safe_path = os.path.abspath(os.path.join(video_input_folder, filename))
    if not safe_path.startswith(os.path.abspath(video_input_folder)):
        return web.Response(status=403, text="Forbidden")
    if not os.path.exists(safe_path):
        return web.Response(status=404, text="File not found")

    mime_type, _ = mimetypes.guess_type(safe_path)
    if not mime_type:
        mime_type = "video/mp4"
    return web.FileResponse(safe_path, headers={"Content-Type": mime_type})
