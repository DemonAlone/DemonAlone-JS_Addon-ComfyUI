import { app } from "../../../scripts/app.js";

console.log("[DA_PlaySound] Extension loaded");

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
                    console.log("[DA_PlaySound] onExecuted triggered with args:", arguments);
                    const executedData = arguments[0];
                    let targetFile = "default.mp3";
                    let targetVolume = 0.5;
                    let maxDuration = 0.0;

                    // If the backend sent data via ui, we take it
                    if (executedData && executedData.ui && executedData.ui.da_play_audio) {
                        const audioData = executedData.ui.da_play_audio[0];
                        targetFile = audioData.file;
                        targetVolume = audioData.volume;
                        maxDuration = audioData.duration;
                    } else {
                       // Otherwise (or forcefully) read directly from the node widgets
                        const fileWidget = this.widgets.find(w => w.name === 'audio_file');
                        const volumeWidget = this.widgets.find(w => w.name === 'volume');
                        const durationWidget = this.widgets.find(w => w.name === 'duration');
                        
                        if (fileWidget) targetFile = fileWidget.value;
                        if (volumeWidget) targetVolume = volumeWidget.value;
                        if (durationWidget) maxDuration = durationWidget.value;
                    }

                    // Path traversal protection
                    if (targetFile.includes('..') || targetFile.startsWith('/') || /^[A-Za-z]:/.test(targetFile)) {
                        console.error(`[DA_PlaySound] Blocked invalid file path: ${targetFile}`);
                        return;
                    }

                    const baseUrl = new URL('.', import.meta.url).href;
                    const audioUrl = new URL(targetFile, baseUrl).href;

                    let audio;
                    if (audioCache[audioUrl]) {
                        audio = audioCache[audioUrl];
                        audio.currentTime = 0;
                    } else {
                        audio = new Audio(audioUrl);
                        audioCache[audioUrl] = audio;
                    }

                    audio.volume = targetVolume;
                    audio.onerror = (e) => console.error("[DA_PlaySound] Audio playback error:", e);

                    if (audio._stopTimeout) {
                        clearTimeout(audio._stopTimeout);
                        audio._stopTimeout = null;
                    }

                    await audio.play();
                    console.log("[DA_PlaySound] Playback started successfully!");

                    if (maxDuration > 0) {
                        audio._stopTimeout = setTimeout(() => {
                            if (!audio.paused) {
                                audio.pause();
                                audio.currentTime = 0;
                            }
                        }, maxDuration * 1000);
                    }

                } catch (e) {
                    console.error("[DA_PlaySound] Error in onExecuted:", e);
                }
            };
        }
    }
});