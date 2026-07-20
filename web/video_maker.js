import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
// The mp4-muxer library is used (author: Vanilagy, license: MIT)
import { Muxer, ArrayBufferTarget } from "./mp4-muxer.mjs";

function debugLog(groupName, message) {
    if (!window.debugGroups) window.debugGroups = {};
    if (!window.debugGroups[groupName]) {
        console.groupCollapsed(groupName);
        window.debugGroups[groupName] = true;
    }
    console.log(message);
}

function finishDebug(groupName) {
    console.groupEnd();
    delete window.debugGroups[groupName];
}

//Global flag to prevent parallel processing within this module
let isProcessing = false;

if (api.defs && api.defs.api_messages) {
    api.defs.api_messages.video_maker_ready = {
        type: "object",
        properties: {
            node_id: { type: "string" },
            session_id: { type: "string" }
        }
    };
}

app.registerExtension({
    name: "VideoMaker",
	async setup() {
		api.addEventListener("video_maker_ready", (event) => {
			const data = event.detail;
			console.log("[VideoMaker] video_maker_ready received:", data);
			
			const sessionId = data.session_id;
			const nodeId = data.node_id;
			if (!sessionId) return;

			let targetNode = null;
			if (nodeId) {
				targetNode = app.graph.getNodeById(nodeId);
			}
			if (!targetNode) {
				// Search among all nodes by comfyClass
				for (const node of app.graph.nodes) {
					if (node.comfyClass === "VideoMakerNode") {
						targetNode = node;
						break;
					}
				}
			}

			if (!targetNode) {
				console.error("[VideoMaker] Target node not found (comfyClass search).");
				return;
			}

            // Passing a flag from the outer scope to the function
            triggerVideoGeneration(targetNode, sessionId);
		});
	},

    async nodeCreated(node) {
        if (node.comfyClass !== "VideoMakerNode") return;

        const container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.backgroundColor = "#111";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.position = "relative";
        container.style.borderRadius = "4px";
        container.style.overflow = "hidden";

        const videoEl = document.createElement("video");
        videoEl.controls = true;
        videoEl.style.width = "100%";
        videoEl.style.height = "100%";
        videoEl.style.objectFit = "contain";
        videoEl.style.display = "none";
        container.appendChild(videoEl);

        const statusDiv = document.createElement("div");
        statusDiv.style.color = "#888";
        statusDiv.style.fontFamily = "sans-serif";
        statusDiv.style.fontSize = "14px";
        statusDiv.textContent = "Ready";
        container.appendChild(statusDiv);

        const resizeHandle = document.createElement("div");
        resizeHandle.style.position = "absolute";
        resizeHandle.style.right = "0";
        resizeHandle.style.bottom = "0";
        resizeHandle.style.width = "16px";
        resizeHandle.style.height = "16px";
        resizeHandle.style.cursor = "se-resize";
        resizeHandle.style.backgroundColor = "rgba(255,255,255,0.2)";
        resizeHandle.style.zIndex = "20";
        container.appendChild(resizeHandle);

        node.addDOMWidget("video_preview", "video_widget", container);
        node.size = [360, 280];

        node.videoEl = videoEl;
        node.statusDiv = statusDiv;

        resizeHandle.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = node.size[0];
            const startH = node.size[1];
            
            const onMove = (ev) => {
                const w = Math.max(250, startW + ev.clientX - startX);
                const h = Math.max(200, startH + ev.clientY - startY);
                node.size = [w, h];
                node.setSize(node.size);
                app.graph.setDirtyCanvas(true, true);
            };
            const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        });
    }
});

async function triggerVideoGeneration(node, sessionId) {
	// Check if processing
    if (isProcessing) {
        console.warn("[VideoMaker] Ignoring session " + sessionId + ", as already busy.");
        return;
    }
    isProcessing = true;
    try {
        const statusDiv = node.statusDiv;
        const videoEl = node.videoEl;

        // 1. Metadata
        debugLog("VideoMaker", "Fetching metadata...");
        const meta = await (await fetch(`/customvideo/meta?id=${sessionId}`)).json();
        
        // 2. Reading packed frames
        const framesResp = await fetch(`/customvideo/frames?id=${sessionId}`);
        const buf = await framesResp.arrayBuffer();
        const view = new DataView(buf);
        let off = 0;
        
        const totalFrames = view.getUint32(off); off += 4;
        const frameBlobs = [];
        
        for (let i = 0; i < totalFrames; i++) {
            const frameSize = view.getUint32(off); off += 4;
            const frameData = new Uint8Array(buf.slice(off, off + frameSize));
            off += frameSize;
            // Frames are now compressed in JPEG
            frameBlobs.push(new Blob([frameData], { type: "image/jpeg" }));
        }
        debugLog("VideoMaker", `JPEG frames received: ${totalFrames}`);

        // 3. Audio
        let audioBuf = null;
        if (meta.audio_available) {
            if (statusDiv) statusDiv.textContent = "Loading audio...";
            const aResp = await fetch(`/customvideo/audio?id=${sessionId}`);
            if (aResp.ok) audioBuf = await aResp.arrayBuffer();
        }

        // 4. Encoding
        if (statusDiv) statusDiv.textContent = "Coding audio...";
        const blob = await encodeVideo(frameBlobs, meta.width, meta.height, meta.fps, audioBuf, meta.trim_audio);

        // 5. Saving
        if (statusDiv) statusDiv.textContent = "Saving...";
        const form = new FormData();
        form.append("file", blob, meta.filename || "video.mp4");
        form.append("filename", meta.filename || "video.mp4");
        
        const saveResp = await fetch("/customvideo/save", { method: "POST", body: form });
        const { path } = await saveResp.json();
        debugLog("VideoMaker", `Saved to output folder: ${path}`);

        // 6. Show video
        if (videoEl) {
            const parts = path.split('/');
            const filename = parts.pop();
            const subfolder = parts.join('/');
            const params = new URLSearchParams({
                filename: filename,
                type: 'output',
                ...(subfolder && { subfolder: subfolder })
            });
            videoEl.src = `/view?${params.toString()}`;
            videoEl.style.display = "block";
            videoEl.load();
        }
        if (statusDiv) statusDiv.style.display = "none";

    } catch (err) {
        console.error("[VideoMaker] Processing error:", err);
        finishDebug("VideoMaker");
        if (statusDiv) {
            statusDiv.textContent = "Error: " + err.message;
            statusDiv.style.display = "block";
        }
    } finally {
        isProcessing = false;
        finishDebug("VideoMaker");
    }
}

async function encodeVideo(frameBlobs, width, height, fps, audioArrayBuffer, trimAudio = false) {
    debugLog("VideoMaker", `Encoding started: trim=${trimAudio}, frames=${frameBlobs.length}, fps=${fps}`);
    
    const videoChunks = [];
    const encoder = new VideoEncoder({
        output: (chunk, meta) => videoChunks.push({ chunk, meta }),
        error: e => console.error("VideoEncoder error:", e)
    });
    
    encoder.configure({
        codec: "avc1.42001f",
        width,
        height,
        bitrate: 6_000_000,
        framerate: fps
    });

    for (let i = 0; i < frameBlobs.length; i++) {
        const bitmap = await createImageBitmap(frameBlobs[i]);
        const frame = new VideoFrame(bitmap, { timestamp: Math.round((i / fps) * 1_000_000) });
        encoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();
        bitmap.close();
    }
    await encoder.flush();
    encoder.close();

    let audioChunks = [];
    let audioSampleRate = 0, numChannels = 0;
    
    if (audioArrayBuffer) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);

        // --- Trimming if enabled ---
        if (trimAudio) {
            const videoDuration = frameBlobs.length / fps;
            if (audioBuffer.duration > videoDuration) {
                const newLength = Math.floor(videoDuration * audioBuffer.sampleRate);
                const newBuffer = audioCtx.createBuffer(
                    audioBuffer.numberOfChannels,
                    newLength,
                    audioBuffer.sampleRate
                );
                for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
                    const src = audioBuffer.getChannelData(ch);
                    const dst = newBuffer.getChannelData(ch);
                    dst.set(src.subarray(0, newLength));
                }
                audioBuffer = newBuffer;
            }
        }

        // Now working with trimmed audioBuffer
        audioSampleRate = audioBuffer.sampleRate;
        numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const pcm = new Float32Array(length * numChannels);
        for (let ch = 0; ch < numChannels; ch++) {
            pcm.set(audioBuffer.getChannelData(ch), ch * length);
        }
        audioCtx.close();

        const audioEncoder = new AudioEncoder({
            output: (chunk, meta) => audioChunks.push({ chunk, meta }),
            error: e => console.error("AudioEncoder error:", e)
        });
        audioEncoder.configure({
			codec: "mp4a.40.2",
			sampleRate: audioSampleRate,
			numberOfChannels: numChannels,
			bitrate: 192000
        });

		const frameSize = 1024;
		const totalAudioFrames = Math.ceil(length / frameSize);
		for (let i = 0; i < totalAudioFrames; i++) {
			const offset = i * frameSize;
			const numSamples = Math.min(frameSize, length - offset);
			const sampleTimestamp = Math.round((offset / audioSampleRate) * 1_000_000);

			let data;
			if (numChannels === 1) {
				data = pcm.subarray(offset, offset + numSamples);
			} else {
				// Planar data: first all samples of channel 0, then channel 1, ...
				const channelData = [];
				for (let ch = 0; ch < numChannels; ch++) {
					const start = ch * length + offset;
					const end = start + numSamples;
					channelData.push(pcm.subarray(start, end));
				}
				// Glue into one flat array
				data = new Float32Array(numSamples * numChannels);
				let pos = 0;
				for (let ch = 0; ch < numChannels; ch++) {
					data.set(channelData[ch], pos);
					pos += numSamples;
				}
			}

			const audioData = new AudioData({
				format: "f32-planar",
				sampleRate: audioSampleRate,
				numberOfFrames: numSamples,
				numberOfChannels: numChannels,
				timestamp: sampleTimestamp,
				data: data
			});
			audioEncoder.encode(audioData);
			audioData.close();
		}
        await audioEncoder.flush();
        audioEncoder.close();
    }

    const muxerConfig = {
        target: new ArrayBufferTarget(),
        video: { codec: "avc", width, height },
        fastStart: 'in-memory',
        firstTimestampBehavior: "offset"
    };
    if (audioChunks.length) {
        muxerConfig.audio = {
            codec: "aac",
            numberOfChannels: numChannels,
            sampleRate: audioSampleRate
        };
    }
    const muxer = new Muxer(muxerConfig);
    for (const { chunk, meta } of videoChunks) muxer.addVideoChunk(chunk, meta);
	
    // Loop adding audio to muxer with logs
    for (let i = 0; i < audioChunks.length; i++) {
		const { chunk, meta } = audioChunks[i];
		// Pass timestamp from chunk into meta
		const metaWithTimestamp = { ...meta, timestamp: chunk.timestamp };
		muxer.addAudioChunk(chunk, metaWithTimestamp); 
	}
    
    muxer.finalize();
    debugLog("VideoMaker", "Encoding finished");

    return new Blob([muxer.target.buffer], { type: "video/mp4" });
}