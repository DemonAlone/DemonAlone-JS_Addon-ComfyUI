import { app } from "../../../scripts/app.js";

console.log("[DA_ResolutionSelector] Extension loaded");

app.registerExtension({
    name: "Comfy.DA_ResolutionSelector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DA_ResolutionSelector") {
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                if (origNodeCreated) {
                    origNodeCreated.apply(this, arguments);
                }

                const node = this;
                const MIN_WIDTH = 380;
                const MIN_HEIGHT = 520;

                const originalComputeSize = node.computeSize;
                node.computeSize = function() {
                    const size = originalComputeSize ? originalComputeSize.apply(this, arguments) : [200, 100];
                    size[0] = Math.max(size[0], MIN_WIDTH);
                    size[1] = Math.max(size[1] || 0, MIN_HEIGHT);
                    return size;
                };

                // Find standard widgets from Python
                const widthWidget = node.widgets.find(w => w.name === "width");
                const heightWidget = node.widgets.find(w => w.name === "height");
                const stepWidget = node.widgets.find(w => w.name === "step_size");
                const multWidget = node.widgets.find(w => w.name === "scale_mult");
                const presetWidget = node.widgets.find(w => w.name === "scale_preset");
                const mpWidget = node.widgets.find(w => w.name === "scale_mp");
                const alignWidget = node.widgets.find(w => w.name === "align_to_step");

                if (!widthWidget || !heightWidget || !stepWidget) return;

                const updateSteps = () => {
                    const stepVal = alignWidget && !alignWidget.value ? 1 : (parseInt(stepWidget.value) || 1);
                    [widthWidget, heightWidget].forEach(w => {
                        if (w.options) {
                            w.options.step = stepVal;
                            w.options.step2 = stepVal;
                        }
                    });
                };

                if (stepWidget) {
                    const origCallback = stepWidget.callback;
                    stepWidget.callback = function(v) {
                        if (origCallback) origCallback.apply(this, arguments);
                        updateSteps();
                    };
                }

                if (alignWidget) {
                    const origAlignCallback = alignWidget.callback;
                    alignWidget.callback = function(v) {
                        if (origAlignCallback) origAlignCallback.apply(this, arguments);
                        updateSteps();
                    };
                }

                updateSteps();

                // Function to create informational DOM widget
                const createInfoWidget = (name) => {
                    const div = document.createElement("div");
                    div.style.width = "100%";
                    div.style.padding = "4px 8px";
                    div.style.boxSizing = "border-box";
                    div.style.fontFamily = "sans-serif";
                    div.style.fontSize = "13px";
                    div.style.color = "#fff";
                    div.style.backgroundColor = "rgba(0, 0, 0, 0.25)";
                    div.style.borderRadius = "4px";
					div.style.textAlign = "center"; // Center text alignment
                    
                    const widget = node.addDOMWidget(name, "info", div);
                    widget.element = div; // Explicitly anchor reference to element
                    return widget;
                };

                // Create 4 separate blocks
                const infoMainWidget = createInfoWidget("info_main");
                const infoMultWidget = createInfoWidget("info_mult");
                const infoPresetWidget = createInfoWidget("info_preset");
                const infoMpWidget = createInfoWidget("info_mp");

                const resolutionsTotalPixels = {
					"144p":  25600,   // 256x144
					"240p":  76800,   // 426x240
					"360p":  230400,  // 640x360
					"480p":  407808,  // 854x480
					"720p":  921600,  // 1280x720
					"1080p": 2073600, // 1920x1080
					"1440p": 3686400, // 2560x1440
					"2160p (4K)": 8294400 // 3840x2160
				};

				const calculatePresetSize = (curW, curH, presetName) => {
					const targetPixels = resolutionsTotalPixels[presetName] || 2073600;
					const currentPixels = (curW * curH) || 1;
					
					// Area scaling factor
					const scaleFactor = Math.sqrt(targetPixels / currentPixels);
					
					const pW = Math.round(curW * scaleFactor);
					const pH = Math.round(curH * scaleFactor);
					
					return [pW, pH];
				};

                const refreshUIValues = () => {
                    const curW = Math.round(widthWidget.value || 0);
                    const curH = Math.round(heightWidget.value || 0);
                    const mp = ((curW * curH) / 1000000).toFixed(2);
                    const pVal = Math.min(curW, curH);

                    // 1. Update main info block
                    if (infoMainWidget.element) {
                        infoMainWidget.element.textContent = `${curW} × ${curH} | ${mp} MP (${pVal}p)`;
                    }

                    // 2. Update multiplier info block
                    const m = multWidget ? multWidget.value : 1.3;
                    const p1W = Math.round(curW * m);
                    const p1H = Math.round(curH * m);
                    if (infoMultWidget.element) {
                        infoMultWidget.element.textContent = `Preview -> Mult: ${p1W}×${p1H}`;
                    }

                    // 3. Update preset info block
                    const pName = presetWidget ? presetWidget.value : "1080p";
                    const [p2W, p2H] = calculatePresetSize(curW, curH, pName);
                    if (infoPresetWidget.element) {
                        infoPresetWidget.element.textContent = `Preview -> Preset (${pName}): ${p2W}×${p2H}`;
                    }

                    // 4. Update megapixels info block
                    const targetMP = mpWidget ? mpWidget.value : 1.0;
                    const currentMP = (curW * curH) / 1000000;
                    const scaleFactor = currentMP > 0 ? Math.sqrt(targetMP / currentMP) : 1;
                    const p3W = Math.round(curW * scaleFactor);
                    const p3H = Math.round(curH * scaleFactor);
                    if (infoMpWidget.element) {
                        infoMpWidget.element.textContent = `Preview -> MP (${targetMP}MP): ${p3W}×${p3H}`;
                    }
                };

                const commitValue = (widget, val) => {
                    widget.value = val;
                    if (widget.inputEl) {
                        widget.inputEl.value = val;
                        widget.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    if (widget.callback) {
                        widget.callback(val);
                    }
                    refreshUIValues();
                };

                [widthWidget, heightWidget, multWidget, presetWidget, mpWidget].forEach(w => {
                    if (w) {
                        const oldCb = w.callback;
                        w.callback = function(v) {
                            if (oldCb) oldCb.apply(this, arguments);
                            refreshUIValues();
                        };
                    }
                });

                // Create buttons
                const btnReadResolution = node.addWidget("button", "Read Resolution", null, () => {
                    const imageInputIndex = node.inputs ? node.inputs.findIndex(i => i.name === "image") : -1;
                    if (imageInputIndex === -1) return;

                    const linkId = node.inputs[imageInputIndex].link;
                    if (linkId != null && app.graph.links && app.graph.links[linkId]) {
                        const link = app.graph.links[linkId];
                        const originNode = app.graph.getNodeById(link.origin_id);
                        if (originNode) {
                            if (originNode.imgs && originNode.imgs.length > 0 && originNode.imgs[0].naturalWidth) {
                                commitValue(widthWidget, originNode.imgs[0].naturalWidth);
                                commitValue(heightWidget, originNode.imgs[0].naturalHeight);
                            } else {
                                const origW = originNode.widgets?.find(w => w.name === "width" || w.name === "image_width")?.value;
                                const origH = originNode.widgets?.find(w => w.name === "height" || w.name === "image_height")?.value;
                                if (origW && origH) {
                                    commitValue(widthWidget, origW);
                                    commitValue(heightWidget, origH);
                                }
                            }
                            node.setDirtyCanvas(true, true);
                        }
                    }
                });

                const btnSwap = node.addWidget("button", "Swap Width / Height", null, () => {
                    const wVal = Math.round(widthWidget.value);
                    const hVal = Math.round(heightWidget.value);
                    commitValue(widthWidget, hVal);
                    commitValue(heightWidget, wVal);
                    node.setDirtyCanvas(true, true);
                });

                const btnApplyMult = node.addWidget("button", "Apply Multiplier", null, () => {
                    const m = multWidget ? multWidget.value : 1.0;
                    const newW = Math.max(64, Math.min(32768, Math.round(widthWidget.value * m)));
                    const newH = Math.max(64, Math.min(32768, Math.round(heightWidget.value * m)));
                    commitValue(widthWidget, newW);
                    commitValue(heightWidget, newH);
                    node.setDirtyCanvas(true, true);
                });

                const btnApplyPreset = node.addWidget("button", "Apply Preset Height", null, () => {
                    const pName = presetWidget ? presetWidget.value : "1080p";
                    const [pW, pH] = calculatePresetSize(widthWidget.value, heightWidget.value, pName);
                    commitValue(widthWidget, Math.max(64, Math.min(32768, pW)));
                    commitValue(heightWidget, Math.max(64, Math.min(32768, pH)));
                    node.setDirtyCanvas(true, true);
                });

                const btnApplyMp = node.addWidget("button", "Apply Megapixels (MP)", null, () => {
                    const targetMP = mpWidget ? mpWidget.value : 1.0;
                    const curW = widthWidget.value;
                    const curH = heightWidget.value;
                    const currentMP = (curW * curH) / 1000000;
                    const scaleFactor = currentMP > 0 ? Math.sqrt(targetMP / currentMP) : 1;
                    commitValue(widthWidget, Math.max(64, Math.min(32768, Math.round(curW * scaleFactor))));
                    commitValue(heightWidget, Math.max(64, Math.min(32768, Math.round(curH * scaleFactor))));
                    node.setDirtyCanvas(true, true);
                });

                // Reorder widgets
                node.widgets = [
                    infoMainWidget,     // 1. Current info line
                    widthWidget,        // 2. Width
                    heightWidget,       // 3. Height
                    stepWidget,         // 4. Step size
                    alignWidget,        // (Additionally keep align_to_step next to step)
                    btnSwap,            // 5. Swap width/height
                    infoMultWidget,     // 6. Multiplier info line
                    multWidget,         // 7. Scale_mult
                    btnApplyMult,       // 8. Apply multiplier button
                    infoPresetWidget,   // 9. Preset info
                    presetWidget,       // 10. Scale_preset
                    btnApplyPreset,     // 11. Apply preset height button
                    infoMpWidget,       // 12. MP info
                    mpWidget,           // 13. Scale_mp
                    btnApplyMp,         // 14. Megapixels button
                    btnReadResolution   // 15. Read resolution button
                ].filter(Boolean);

                refreshUIValues();
                node.setSize([MIN_WIDTH, MIN_HEIGHT]);
            };
        }
    }
});