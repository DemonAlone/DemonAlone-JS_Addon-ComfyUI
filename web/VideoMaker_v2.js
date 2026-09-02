import { app } from "../../scripts/app.js";

console.log("[VideoMakerV2] Extension loaded [START]");

app.registerExtension({
    name: "VideoMakerV2",
    async nodeCreated(node) {
        if (node.comfyClass !== "VideoMakerV2") return;

        const container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.flex = "1 1 0px";
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
        videoEl.style.flex = "1 1 0px";
        videoEl.style.minWidth = "0px";
        videoEl.style.minHeight = "0px";
        videoEl.style.objectFit = "contain"; // Maintains proportions without distortion
        videoEl.style.display = "none";
        container.appendChild(videoEl);

        const statusDiv = document.createElement("div");
        statusDiv.style.color = "#888";
        statusDiv.style.fontFamily = "sans-serif";
        statusDiv.style.fontSize = "14px";
        statusDiv.textContent = "Ready to generate";
        container.appendChild(statusDiv);

        node.addDOMWidget("video_preview", "video_widget", container);
        // Set initial node size if not already defined
        if (!node.size || node.size[0] < 360) {
            node.size = [360, 320];
        }

        node.videoEl = videoEl;
        node.statusDiv = statusDiv;
		
        // Listen for 'executed' event to capture completion messages specifically from this node
        const origOnExecuted = node.onExecuted;
        node.onExecuted = function(message) {
            if (origOnExecuted) {
                origOnExecuted.apply(this, arguments);
            }
            
            console.log("[VideoMakerV2] Node executed message:", message);
            
            // ComfyUI returns the values it received (if passed via ui)
			// We return a regular array, so extract path from message.filename if available,
			// or fallback to the standard mechanism or pass through UI.
            if (message && message.filename) {
                const path = message.filename[0]; // usually returned as an array in ComfyUI
                updateVideoPreview(node, path);
            }
        };
    }
});

function updateVideoPreview(node, path) {
    if (!node.videoEl) return;
    
    const parts = path.split('/');
    const filename = parts.pop();
    const subfolder = parts.join('/');
    
    const params = new URLSearchParams({
        filename: filename,
        type: 'output',
        ...(subfolder && { subfolder: subfolder }),
        t: Date.now()
    });

    node.videoEl.src = `/view?${params.toString()}`;
    node.videoEl.style.display = "block";
    node.videoEl.load();
    
    if (node.statusDiv) {
        node.statusDiv.style.display = "none";
    }
    
    node.setDirtyCanvas(true, true);
    console.log("[VideoMakerV2] Preview updated for node id:", node.id);
}