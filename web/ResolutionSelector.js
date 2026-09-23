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
				const presetWidget = node.widgets.find(w => w.name === "resolution_preset");
				const priorityWidget = node.widgets.find(w => w.name === "priority_mode");
                const multWidget = node.widgets.find(w => w.name === "scale_mult");
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

                // Auxiliary functions for checking toggle switches and steps
                const getStepValue = () => {
                    if (alignWidget && alignWidget.value === false) return 1;
                    return parseInt(stepWidget.value) || 1;
                };

                const isStrictStepMode = () => {
                    return priorityWidget && priorityWidget.value && priorityWidget.value.includes("Strict Step");
                };

                // Hard fitting method taking into account priority mode
                const applyConstraints = (w, h) => {
                    let rw = Math.round(w);
                    let rh = Math.round(h);
                    const step = getStepValue();
                    if (isStrictStepMode() && step > 1) {
                        rw = Math.round(rw / step) * step;
                        rh = Math.round(rh / step) * step;
                    }
                    return [Math.max(64, Math.min(32768, rw)), Math.max(64, Math.min(32768, rh))];
                };

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

                // Create 3 separate blocks
                const infoMainWidget = createInfoWidget("info_main");
                const infoMultWidget = createInfoWidget("info_mult");
                const infoMpWidget = createInfoWidget("info_mp");

                // Dictionary of fixed resolutions from presets
                const presetResolutions = {
                    "1:1 Square (1024×1024)": [1024, 1024],
                    "3:4 Portrait (768×1024)": [768, 1024],
                    "4:5 Portrait (915×1144)": [915, 1144],
                    "5:12 Portrait (640×1536)": [640, 1536],
                    "7:9 Portrait (896×1152)": [896, 1152],
                    "9:16 Portrait (768×1344)": [768, 1344],
                    "13:19 Portrait (832×1216)": [832, 1216],
                    "3:2 Landscape (1254×836)": [1254, 836],
                    "4:3 Landscape (1024×768)": [1024, 768],
                    "16:9 Landscape (1344×768)": [1344, 768],
                    "21:9 Landscape (1536×640)": [1536, 640]
                };

                const refreshUIValues = () => {
                    const curW = Math.round(widthWidget.value || 0);
                    const curH = Math.round(heightWidget.value || 0);
                    const mp = ((curW * curH) / 1000000).toFixed(2);

                    // 1. Update main info block
                    if (infoMainWidget.element) {
                        infoMainWidget.element.textContent = `${curW} × ${curH} | ${mp} MP`;
                    }

                    // 2. Update multiplier info block
                    const m = multWidget ? multWidget.value : 1.3;
                    const [p1W, p1H] = applyConstraints(curW * m, curH * m);
					const p1Mp = ((p1W * p1H) / 1000000).toFixed(2);
                    if (infoMultWidget.element) {
                        infoMultWidget.element.textContent = `Preview -> Mult: ${p1W}×${p1H} (${p1Mp} MP)`;
                    }

                    // 3. Update megapixels info block
                    const targetMP = mpWidget ? mpWidget.value : 1.0;
                    const currentMP = (curW * curH) / 1000000;
                    const scaleFactor = currentMP > 0 ? Math.sqrt(targetMP / currentMP) : 1;
                    const [p3W, p3H] = applyConstraints(curW * scaleFactor, curH * scaleFactor);
					const p3Mp = ((p3W * p3H) / 1000000).toFixed(2);
                    if (infoMpWidget.element) {
                        infoMpWidget.element.textContent = `Preview -> MP (${targetMP}MP): ${p3W}×${p3H} (${p3Mp} MP)`;
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

                // Apply the preset taking into account the priority mode
                if (presetWidget) {
                    const origPresetCb = presetWidget.callback;
                    presetWidget.callback = function(v) {
                        if (origPresetCb) origPresetCb.apply(this, arguments);
                        if (presetResolutions[v]) {
                            const [resW, resH] = presetResolutions[v];
                            const [finalW, finalH] = applyConstraints(resW, resH);
                            commitValue(widthWidget, finalW);
                            commitValue(heightWidget, finalH);
							// Reset the selector value back to 'Custom / None'
                            setTimeout(() => {
                                commitValue(presetWidget, "Custom / None");
                                node.setDirtyCanvas(true, true);
                            }, 50);
                        }
                    };
                }

                [widthWidget, heightWidget, multWidget, mpWidget, priorityWidget, alignWidget, stepWidget].forEach(w => {
                    if (w) {
                        const oldCb = w.callback;
                        w.callback = function(v) {
                            if (oldCb) oldCb.apply(this, arguments);
                            refreshUIValues();
                        };
                    }
                });

                // Create buttons
                const btnReadResolution = node.addWidget("button", "Read Image Resolution", null, () => {
                    const imageInputIndex = node.inputs ? node.inputs.findIndex(i => i.name === "image") : -1;
                    if (imageInputIndex === -1) return;

                    const linkId = node.inputs[imageInputIndex].link;
                    if (linkId != null && app.graph.links && app.graph.links[linkId]) {
                        const link = app.graph.links[linkId];
                        const originNode = app.graph.getNodeById(link.origin_id);
                        if (originNode) {
                            if (originNode.imgs && originNode.imgs.length > 0 && originNode.imgs[0].naturalWidth) {
                                const [fw, fh] = applyConstraints(originNode.imgs[0].naturalWidth, originNode.imgs[0].naturalHeight);
                                commitValue(widthWidget, fw);
                                commitValue(heightWidget, fh);
                            } else {
                                const origW = originNode.widgets?.find(w => w.name === "width" || w.name === "image_width")?.value;
                                const origH = originNode.widgets?.find(w => w.name === "height" || w.name === "image_height")?.value;
                                if (origW && origH) {
                                    const [fw, fh] = applyConstraints(origW, origH);
                                    commitValue(widthWidget, fw);
                                    commitValue(heightWidget, fh);
                                }
                            }
                            node.setDirtyCanvas(true, true);
                        }
                    }
                });

                const btnSwap = node.addWidget("button", "Swap Width / Height", null, () => {
                    const [fw, fh] = applyConstraints(heightWidget.value, widthWidget.value);
                    commitValue(widthWidget, fw);
                    commitValue(heightWidget, fh);
                    node.setDirtyCanvas(true, true);
                });

                // Apply buttons now use the same applyConstraints logic as previews
                const btnApplyMult = node.addWidget("button", "Apply Multiplier", null, () => {
                    const m = multWidget ? multWidget.value : 1.0;
                    const [fw, fh] = applyConstraints(widthWidget.value * m, heightWidget.value * m);
                    commitValue(widthWidget, fw);
                    commitValue(heightWidget, fh);
                    node.setDirtyCanvas(true, true);
                });


                const btnApplyMp = node.addWidget("button", "Apply Megapixels (MP)", null, () => {
                    const targetMP = mpWidget ? mpWidget.value : 1.0;
                    const curW = widthWidget.value;
                    const curH = heightWidget.value;
                    const currentMP = (curW * curH) / 1000000;
                    const scaleFactor = currentMP > 0 ? Math.sqrt(targetMP / currentMP) : 1;
                    const [fw, fh] = applyConstraints(curW * scaleFactor, curH * scaleFactor);
                    commitValue(widthWidget, fw);
                    commitValue(heightWidget, fh);
                    node.setDirtyCanvas(true, true);
                });

                // Reorder widgets
                node.widgets = [
                    infoMainWidget,     // 1. Current info line
                    widthWidget,        // 2. Width
                    heightWidget,       // 3. Height
                    stepWidget,         // 4. Step size
                    alignWidget,        // 5. (Additionally keep align_to_step next to step)
                    priorityWidget,     // 6.
                    btnSwap,            // 7. Swap width/height
					presetWidget,       // 8.
                    infoMultWidget,     // 9. Multiplier info line
                    multWidget,         // 10. Scale_mult
                    btnApplyMult,       // 11. Apply multiplier button
                    infoMpWidget,       // 12. MP info
                    mpWidget,           // 13. Scale_mp
                    btnApplyMp,         // 14. Megapixels button
                    btnReadResolution   // 15. Read resolution button
                ].filter(Boolean);

                refreshUIValues();
                node.setSize([MIN_WIDTH, MIN_HEIGHT + 30]);
            };
        }
    }
});