import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "LoadVideo",
    async nodeCreated(node) {
        if (node.comfyClass !== "LoadVideoNode") return;

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
        videoEl.style.display = "block";
        container.appendChild(videoEl);

        const statusDiv = document.createElement("div");
        statusDiv.style.position = "absolute";
        statusDiv.style.color = "#888";
        statusDiv.style.fontFamily = "sans-serif";
        statusDiv.style.fontSize = "14px";
        statusDiv.textContent = "No video selected";
        container.appendChild(statusDiv);

		// ---------- Drag-and-drop and Upload Button ----------
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".mp4,.avi,.mov,.mkv,.webm";
        fileInput.style.display = "none";
        container.appendChild(fileInput);

        // Container for button and status (top right corner)
        const controlsDiv = document.createElement("div");
        controlsDiv.style.position = "absolute";
        controlsDiv.style.top = "10px";
        controlsDiv.style.right = "10px";
        controlsDiv.style.display = "flex";
        controlsDiv.style.flexDirection = "column";
        controlsDiv.style.alignItems = "flex-end";
        controlsDiv.style.gap = "4px";
        controlsDiv.style.zIndex = "10";
        controlsDiv.style.pointerEvents = "none"; // не мешаем кликам по видео
        container.appendChild(controlsDiv);

        const uploadBtn = document.createElement("button");
        uploadBtn.textContent = "📁 Upload";
        uploadBtn.style.padding = "4px 8px";
        uploadBtn.style.backgroundColor = "rgba(0,0,0,0.6)";
        uploadBtn.style.color = "#fff";
        uploadBtn.style.border = "1px solid #666";
        uploadBtn.style.borderRadius = "4px";
        uploadBtn.style.cursor = "pointer";
        uploadBtn.style.fontSize = "12px";
        uploadBtn.style.pointerEvents = "auto";
        uploadBtn.style.transition = "background 0.2s";
        uploadBtn.onmouseover = () => uploadBtn.style.backgroundColor = "rgba(60,60,60,0.8)";
        uploadBtn.onmouseout = () => uploadBtn.style.backgroundColor = "rgba(0,0,0,0.6)";
        uploadBtn.onclick = () => fileInput.click();
        controlsDiv.appendChild(uploadBtn);

        const uploadStatus = document.createElement("div");
        uploadStatus.style.color = "#fff";
        uploadStatus.style.fontSize = "12px";
        uploadStatus.style.backgroundColor = "rgba(0,0,0,0.5)";
        uploadStatus.style.padding = "2px 6px";
        uploadStatus.style.borderRadius = "3px";
        uploadStatus.style.display = "none";
        controlsDiv.appendChild(uploadStatus);

		// Handling file selection via button
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await uploadFile(file, uploadStatus, node);
            fileInput.value = "";
        });

        // Drag-and-drop on container
        container.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            container.style.border = "2px dashed #4a8";
        });

        container.addEventListener("dragleave", (e) => {
            e.preventDefault();
            container.style.border = "none";
        });

        container.addEventListener("drop", async (e) => {
            e.preventDefault();
            container.style.border = "none";
            const files = e.dataTransfer.files;
            if (files.length === 0) return;
            const file = files[0];
            await uploadFile(file, uploadStatus, node);
        });

        async function uploadFile(file, statusEl, node) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) {
                statusEl.style.display = "block";
                statusEl.textContent = "❌ Unsupported";
                setTimeout(() => statusEl.style.display = "none", 3000);
                return;
            }

            statusEl.style.display = "block";
            statusEl.textContent = "⏳ Uploading...";
            const formData = new FormData();
            formData.append("file", file);

            try {
                const resp = await fetch("/uploadvideo", { method: "POST", body: formData });
                if (!resp.ok) throw new Error("Upload failed");
                const json = await resp.json();
                const filename = json.name;

                const widget = node.videoWidget;
                if (widget) {
                    // // Drag-and-drop on container
                    let options = widget.options;
                    if (options && Array.isArray(options)) {
                        if (!options.includes(filename)) {
                            options.push(filename);
                            const idx = options.indexOf("No video files found");
                            if (idx !== -1) options.splice(idx, 1);
                        }
                    } else if (options && options.values && Array.isArray(options.values)) {
                        if (!options.values.includes(filename)) {
                            options.values.push(filename);
                            const idx = options.values.indexOf("No video files found");
                            if (idx !== -1) options.values.splice(idx, 1);
                        }
                    } else {
                        console.warn("Unknown widget options structure", options);
                    }

                    widget.value = filename;
                    if (widget.callback) widget.callback(filename);
                }

                statusEl.textContent = "✅ Done";
                setTimeout(() => statusEl.style.display = "none", 3000);
            } catch (err) {
                console.error("Upload error:", err);
                statusEl.textContent = "❌ Error";
                setTimeout(() => statusEl.style.display = "none", 3000);
            }
        }
        // ---------- End of upload block ----------

        node.addDOMWidget("video_preview", "video_widget", container);
        node.size = [360, 280];

        const videoWidget = node.widgets?.find(w => w.name === "video");
        if (videoWidget) {
            node.videoWidget = videoWidget;
            const updateVideo = () => {
                const filename = videoWidget.value;
                if (filename && filename !== "No video files found") {
                    const url = `/inputvideo?file=${encodeURIComponent(filename)}`;
                    videoEl.src = url;
                    videoEl.load();
                    statusDiv.style.display = "none";
                    videoEl.style.display = "block";
                } else {
                    videoEl.style.display = "none";
                    statusDiv.style.display = "block";
                    statusDiv.textContent = "No video selected";
                }
            };
            const originalCallback = videoWidget.callback;
            videoWidget.callback = function(value) {
                if (originalCallback) originalCallback(value);
                updateVideo();
            };
            setTimeout(updateVideo, 100);
        }

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