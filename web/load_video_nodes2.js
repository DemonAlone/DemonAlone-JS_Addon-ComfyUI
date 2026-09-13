import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

console.log("[Load video Nodes 2.0] Extension loaded");

app.registerExtension({
    name: "LoadVideoNodes2",
    async nodeCreated(node) {
        if (node.comfyClass !== "LoadVideoNodes2") return;

		const container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.flex = "1 1 0px";    // Forcefully allow the flex to collapse
        container.style.minWidth = "0px";
        container.style.minHeight = "0px";
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
        videoEl.style.flex = "1 1 0px";    // Mandatory for a child element inside a flex in Nodes 2.0
        videoEl.style.minWidth = "0px";
        videoEl.style.minHeight = "0px";
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
        controlsDiv.style.pointerEvents = "none"; // don’t interfere with clicks on videos
        container.appendChild(controlsDiv);
		
		// Create a block to display the resolution
        const resolutionInfo = document.createElement("div");
        resolutionInfo.style.color = "#fff";
        resolutionInfo.style.fontSize = "12px";
        resolutionInfo.style.backgroundColor = "rgba(0,0,0,0.5)";
        resolutionInfo.style.padding = "2px 6px";
        resolutionInfo.style.borderRadius = "3px";
		resolutionInfo.style.display = "none"; // Initially hidden  
		resolutionInfo.style.pointerEvents = "none"; // To avoid blocking clicks  
		controlsDiv.appendChild(resolutionInfo); // Append to controls container
		
		// Create a block to display the FPS
        const fpsInfo = document.createElement("div");
        fpsInfo.style.color = "#fff";
        fpsInfo.style.fontSize = "12px";
        fpsInfo.style.backgroundColor = "rgba(0,0,0,0.5)";
        fpsInfo.style.padding = "2px 6px";
        fpsInfo.style.borderRadius = "3px";
        fpsInfo.style.display = "none";
        fpsInfo.style.pointerEvents = "none";
        fpsInfo.style.marginTop = "4px";
        controlsDiv.appendChild(fpsInfo);
		
		// Create a block to display the Frame Count
        const frameCountInfo = document.createElement("div");
        frameCountInfo.style.color = "#fff";
        frameCountInfo.style.fontSize = "12px";
        frameCountInfo.style.backgroundColor = "rgba(0,0,0,0.5)";
        frameCountInfo.style.padding = "2px 6px";
        frameCountInfo.style.borderRadius = "3px";
        frameCountInfo.style.display = "none";
        frameCountInfo.style.pointerEvents = "none";
        frameCountInfo.style.marginTop = "4px";
        controlsDiv.appendChild(frameCountInfo);


        // Metadata loading handler (attach once)
        videoEl.addEventListener('loadedmetadata', function() {
            // Resolution
			const w = this.videoWidth;
            const h = this.videoHeight;
            if (w && h) {
                resolutionInfo.textContent = `${w}×${h}`;
            } else {
                resolutionInfo.textContent = 'Unknown resolution';
            }
            resolutionInfo.style.display = "block";
        });		

		// Register the main DOM widget of the player
		node.addDOMWidget("video_preview", "video_widget", container);
        node.size = [360, 280];

		// ---------- 2. Video selection synchronization logic ----------
		const videoWidget = node.widgets?.find(w => w.name === "video");
        if (videoWidget) {
            node.videoWidget = videoWidget;
            const updateVideo = async () => {
                const filename = videoWidget.value;
				// Handle selection 'None'
                if (filename && filename !== "None" && filename !== "No video files found") {
                    const url = `/inputvideo?file=${encodeURIComponent(filename)}`;
                    videoEl.src = url;
                    videoEl.load();
                    statusDiv.style.display = "none";
                    videoEl.style.display = "block";
					resolutionInfo.style.display = "block"; // Show infoDiv, but text will update after metadata is loaded
                    resolutionInfo.textContent = "Loading...";
					fpsInfo.textContent = "Loading...";
                    frameCountInfo.textContent = "Loading...";
                    fpsInfo.style.display = "block";
                    frameCountInfo.style.display = "block";
					
					// Requesting exact data from the backend in real time
                    try {
                        const metaResp = await fetch(`/get_video_metadata?file=${encodeURIComponent(filename)}`);
                        if (metaResp.ok) {
                            const meta = await metaResp.json();
                            fpsInfo.textContent = `${meta.fps.toFixed(2)} fps`;
                            frameCountInfo.textContent = `${meta.frame_count} frames`;
                        } else {
                            fpsInfo.textContent = "Error fps";
                            frameCountInfo.textContent = "Error frames";
                        }
                    } catch (err) {
                        console.error("Failed to fetch video metadata:", err);
					}
                } else {
                    videoEl.style.display = "none";
                    statusDiv.style.display = "block";
                    statusDiv.textContent = filename === "None" ? "No video (None)" : "No video selected";
					resolutionInfo.style.display = "none";
					fpsInfo.style.display = "none";
                    frameCountInfo.style.display = "none";
                }
            };
            const originalCallback = videoWidget.callback;
            videoWidget.callback = function(value) {
                if (originalCallback) originalCallback(value);
                updateVideo();
            };
            setTimeout(updateVideo, 100);
        }
		// ---------- 4. Spot hiding of video preview generated by ComfyUI ----------
        const removeStandardFlexPreview = () => {
            // Find the root of the current node in the DOM
            const nodeElement = container.closest('.group\\/node') || container.closest('.lg-node') || container.closest('[data-node-id]');
            if (!nodeElement) return;

            // Look for the video-preview block generated by the engine
            const standardPreview = nodeElement.querySelector('.video-preview');
            if (standardPreview) {
                // Go up one level to the same flex min-h-0 flex-1 flex-col and extinguish it
                const flexParent = standardPreview.closest('.flex.min-h-0.flex-1.flex-col');
                if (flexParent) {
                    flexParent.style.display = "none";
                    flexParent.style.height = "0px";
                    flexParent.style.minHeight = "0px";
                    flexParent.style.overflow = "hidden";
                } else {
                    // Fallback option, if the parent is not found - extinguish the preview itself
                    standardPreview.style.display = "none";
                }
            }
        };

        // Start cleaning with a slight delay so that the DOM has time to build
        setTimeout(removeStandardFlexPreview, 50);
        setTimeout(removeStandardFlexPreview, 300);

        // Safety interval in case the node is redrawn
        const cleanInterval = setInterval(removeStandardFlexPreview, 100);
        setTimeout(() => clearInterval(cleanInterval), 2000);
    }
});