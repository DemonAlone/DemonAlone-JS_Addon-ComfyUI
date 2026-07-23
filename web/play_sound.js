import { app } from "../../../scripts/app.js";

console.log("[DA_PlaySound] Extension loaded");

// Global cache in browser memory to avoid downloading the same file over the network repeatedly
const audioCache = {};

app.registerExtension({
    name: "DA_PlaySound",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "DA_PlaySound") {
            console.log("[DA_PlaySound] Node found, patching onExecuted");

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = async function () {
                onExecuted?.apply(this, arguments);

                try {
                    const executedData = arguments[1];
                    let targetFile = "default.mp3";
                    let targetVolume = 0.5;

                    if (executedData && executedData.ui && executedData.ui.da_play_audio) {
                        const audioData = executedData.ui.da_play_audio[0];
                        targetFile = audioData.file;
                        targetVolume = audioData.volume;
                    } else {
                        const fileWidget = this.widgets.find(w => w.name === 'audio_file');
                        const volumeWidget = this.widgets.find(w => w.name === 'volume');
                        if (fileWidget) targetFile = fileWidget.value;
                        if (volumeWidget) targetVolume = volumeWidget.value;
                    }

                    // Form a correct URL (the file must be in the extension's web folder)
                    const baseUrl = new URL('.', import.meta.url).href;
                    const audioUrl = new URL(targetFile, baseUrl).href;

                    let audio;

                    // Check if this sound is already in browser memory
                    if (audioCache[audioUrl]) {
                        console.log("[DA_PlaySound] Using cached audio object (no network request)");
                        audio = audioCache[audioUrl];
                        // Reset time to start to allow replaying
                        audio.currentTime = 0;
                    } else {
                        console.log("[DA_PlaySound] First network load of file:", audioUrl);
                        audio = new Audio(audioUrl);
                        
                        // Save to cache
                        audioCache[audioUrl] = audio;
                    }

                    audio.volume = targetVolume;
                    audio.onerror = (e) => console.error("[DA_PlaySound] Audio playback error:", e);
                    
                    await audio.play();
                    console.log("[DA_PlaySound] Playback started successfully!");

                } catch (e) {
                    console.error("[DA_PlaySound] Error in onExecuted:", e);
                }
            };
        }
    }
});
