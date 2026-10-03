import { app } from "../../scripts/app.js";

console.log("[Load video Nodes 2.0] Extension loaded");

app.registerExtension({
    name: "LoadVideoNodes2",
    async nodeCreated(node) {
        if (node.comfyClass !== "LoadVideoNodes2") return;

        // Local cache and request lock flag
        if (!node._metaCache) node._metaCache = {};
        node._isLoadingMeta = false;

        let fpsInfo = null;
        let frameCountInfo = null;

        // 1. Creating overlay badges on top of the native player (Offset below control buttons)
        const createOverlay = (playerContainer) => {
            if (playerContainer.querySelector(".custom-meta-overlay")) {
                const overlay = playerContainer.querySelector(".custom-meta-overlay");
                const badges = overlay.querySelectorAll("div");
                fpsInfo = badges[0];
                frameCountInfo = badges[1];
                return;
            }

            const controlsDiv = document.createElement("div");
            controlsDiv.classList.add("custom-meta-overlay");
            controlsDiv.style.position = "absolute";
            // Increased top margin to 45px to clear space above native upload/delete buttons
            controlsDiv.style.top = "45px"; 
            controlsDiv.style.right = "10px";
            controlsDiv.style.display = "flex";
            controlsDiv.style.flexDirection = "column";
            controlsDiv.style.alignItems = "flex-end";
            controlsDiv.style.gap = "4px";
            controlsDiv.style.zIndex = "50"; 
            controlsDiv.style.pointerEvents = "none"; 

            const createBadge = () => {
                const b = document.createElement("div");
                b.style.color = "#fff";
                b.style.fontSize = "12px";
                b.style.fontFamily = "sans-serif";
                b.style.backgroundColor = "rgba(0,0,0,0.65)";
                b.style.padding = "3px 7px";
                b.style.borderRadius = "4px";
                b.style.backdropFilter = "blur(2px)";
                b.style.display = "none";
                controlsDiv.appendChild(b);
                return b;
            };

            // FPS and frame count
            fpsInfo = createBadge();
            frameCountInfo = createBadge();

            playerContainer.appendChild(controlsDiv);
        };

        // 2. Getting data from cache or backend
        const updateMetadata = async (filename) => {
            if (!filename || filename === "None" || filename === "No video files found") {
                if (fpsInfo) {
                    fpsInfo.style.display = "none";
                    frameCountInfo.style.display = "none";
                }
                return;
            }

            // Return cached data if file was already requested
            if (node._metaCache[filename]) {
                const cached = node._metaCache[filename];
                if (fpsInfo) fpsInfo.textContent = `${cached.fps.toFixed(2)} fps`;
                if (frameCountInfo) frameCountInfo.textContent = `${cached.frame_count} frames`;
                if (fpsInfo) {
                    fpsInfo.style.display = "block";
                    frameCountInfo.style.display = "block";
                }
                return;
            }

            if (node._isLoadingMeta === filename) return;

            if (fpsInfo) {
                fpsInfo.style.display = "block";
                frameCountInfo.style.display = "block";
                if (!fpsInfo.textContent || !fpsInfo.textContent.includes("fps")) {
                    fpsInfo.textContent = "Loading...";
                    frameCountInfo.textContent = "Loading...";
                }
            }

            node._isLoadingMeta = filename; 

            try {
                const metaResp = await fetch(`/get_video_metadata?file=${encodeURIComponent(filename)}`);
                if (metaResp.ok) {
                    const meta = await metaResp.json();
                    node._metaCache[filename] = meta;

                    if (node.widgets?.find(w => w.name === "video")?.value === filename) {
                        if (fpsInfo) fpsInfo.textContent = `${meta.fps.toFixed(2)} fps`;
                        if (frameCountInfo) frameCountInfo.textContent = `${meta.frame_count} frames`;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch video metadata:", err);
            } finally {
                if (node._isLoadingMeta === filename) {
                    node._isLoadingMeta = false; 
                }
            }
        };

        // 3. Searching for elements in the canvas DOM
        let lastExecution = 0;
        const checkAndInject = () => {
            const now = Date.now();
            if (now - lastExecution < 60) return; 
            lastExecution = now;

            const nodeElement = document.querySelector(`[data-node-id="${node.id}"]`);
            if (!nodeElement) return;

            const nativeVideo = nodeElement.querySelector('.video-preview video, video:not(.custom-meta-overlay video)');
            if (!nativeVideo) return;

            const playerContainer = nativeVideo.parentElement;
            if (!playerContainer) return;

            createOverlay(playerContainer);

            const videoWidget = node.widgets?.find(w => w.name === "video");
            if (videoWidget && videoWidget.value) {
                updateMetadata(videoWidget.value);
            }
        };

        // 4. Global observer for structural changes
        const globalObserver = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
                    checkAndInject();
                    break;
                }
            }
        });

        globalObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(checkAndInject, 150);

        // Callback when video changes in the built-in Grid menu
        const videoWidget = node.widgets?.find(w => w.name === "video");
        if (videoWidget) {
            const originalCallback = videoWidget.callback;
            videoWidget.callback = function(value) {
                if (originalCallback) originalCallback.apply(this, arguments);
                if (fpsInfo) {
                    fpsInfo.textContent = "Loading...";
                    frameCountInfo.textContent = "Loading...";
                }
                setTimeout(checkAndInject, 20);
            };
        }

        // Disconnect observer when node is removed from the canvas
        const originalOnRemoved = node.onRemoved;
        node.onRemoved = function() {
            if (globalObserver) globalObserver.disconnect();
            if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
        };
    }
});
