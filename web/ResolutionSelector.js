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

                // Find standard widgets from Python
                const widthWidget = node.widgets.find(w => w.name === "width");
                const heightWidget = node.widgets.find(w => w.name === "height");
                const stepWidget = node.widgets.find(w => w.name === "step_size");
				const presetWidget = node.widgets.find(w => w.name === "resolution_preset");
                const multWidget = node.widgets.find(w => w.name === "scale_mult");
                const mpWidget = node.widgets.find(w => w.name === "scale_mp");
                const alignWidget = node.widgets.find(w => w.name === "align_to_step");

                if (!widthWidget || !heightWidget) return;

				// Hide standard inputs, they will be controlled programmatically
                widthWidget.hidden = true;
                heightWidget.hidden = true;
                const getStepValue = () => {
					// If align_to_step is disabled (false), the step is always 1
                    if (alignWidget && alignWidget.value === false) return 1;
                    return parseInt(stepWidget.value) || 1;
                };

                // Hard fitting method taking into account step alignment
                const applyConstraints = (w, h) => {
                    let rw = Math.round(w);
                    let rh = Math.round(h);
                    const step = getStepValue();
					// Apply step alignment only if Strict Step is enabled
                    if (step > 1) {
                        rw = Math.round(rw / step) * step;
                        rh = Math.round(rh / step) * step;
                    }
                    return [Math.max(64, Math.min(32768, rw)), Math.max(64, Math.min(32768, rh))];
                };
                // --- UI CONTROLS ---

                const createNumberControl = (label, initialValue, widgetRef) => {
                    const container = document.createElement("div");
                    container.style.display = "flex";
                    container.style.alignItems = "center";
                    container.style.justifyContent = "space-between";
                    container.style.marginBottom = "4px";
                    container.style.width = "100%";

                    const lbl = document.createElement("span");
                    lbl.textContent = label;
                    lbl.style.width = "50px";
                    lbl.style.fontWeight = "bold";
                    lbl.style.color = "#ccc";

                    const btnMinus = document.createElement("button");
                    btnMinus.textContent = "-";
                    btnMinus.style.width = "30px";
                    btnMinus.style.height = "24px";
                    btnMinus.style.cursor = "pointer";
                    btnMinus.style.backgroundColor = "#333";
                    btnMinus.style.color = "#fff";
                    btnMinus.style.border = "1px solid #555";

                    const valDisplay = document.createElement("input");
                    valDisplay.type = "text";
                    valDisplay.value = initialValue;
                    valDisplay.style.width = "70px";
                    valDisplay.style.textAlign = "center";
                    valDisplay.style.backgroundColor = "#222";
                    valDisplay.style.border = "1px solid #444";
                    valDisplay.style.color = "#fff";
                    valDisplay.style.borderRadius = "4px";
                    valDisplay.style.padding = "2px";

                    const btnPlus = document.createElement("button");
                    btnPlus.textContent = "+";
                    btnPlus.style.width = "30px";
                    btnPlus.style.height = "24px";
                    btnPlus.style.cursor = "pointer";
                    btnPlus.style.backgroundColor = "#333";
                    btnPlus.style.color = "#fff";
                    btnPlus.style.border = "1px solid #555";

                    container.appendChild(lbl);
                    container.appendChild(btnMinus);
                    container.appendChild(valDisplay);
                    container.appendChild(btnPlus);

                    // Update value function (synchronizes everything)
                    const updateValue = (newVal) => {
                        // 1. Get current values of both axes
                        let curW = parseInt(widthWidget.value) || 1024;
                        let curH = parseInt(heightWidget.value) || 1024;

                        // 2. Update the required axis with the new value
                        if (widgetRef === widthWidget) curW = newVal;
                        else curH = newVal;

                        // 3. Apply constraint logic (Snap to step)
                        const [finalW, finalH] = applyConstraints(curW, curH);

                        // 4. Write to hidden widgets (this is the node's output!)
                        widthWidget.value = finalW;
                        heightWidget.value = finalH;

                        // 5. Update visual display
                        valDisplay.value = (widgetRef === widthWidget) ? finalW : finalH;
                        
                        // 6. Update info blocks
                        refreshUIValues();
                        // 7. Mark node as changed
                        node.setDirtyCanvas(true, true);
                    };

                    btnMinus.addEventListener('click', () => {
                        const current = parseInt(valDisplay.value) || 0;
                        const step = getStepValue();
                        updateValue(current - step);
                    });

                    btnPlus.addEventListener('click', () => {
                        const current = parseInt(valDisplay.value) || 0;
                        const step = getStepValue();
                        updateValue(current + step);
                    });

                    // Handle manual input
                    valDisplay.addEventListener('change', (e) => {
                        let v = parseInt(e.target.value);
                        if (!isNaN(v)) {
                            updateValue(v);
                        } else {
                            // If garbage is entered, revert to old value from widget
                            valDisplay.value = widgetRef.value;
                        }
                    });

                    return { container, updateDisplay: (v) => valDisplay.value = v };
                };

                // Create controls
                const widthCtrl = createNumberControl("Width:", widthWidget.value, widthWidget);
                const heightCtrl = createNumberControl("Height:", heightWidget.value, heightWidget);

                // DOM Widgets for insertion into interface
                const widthDomWidget = node.addDOMWidget("custom_width_ctrl", "html", widthCtrl.container);
                const heightDomWidget = node.addDOMWidget("custom_height_ctrl", "html", heightCtrl.container);

				// Create information widgets
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
					div.style.marginTop = "4px";
                    
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
                    "3:4 Portrait (864×1152)": [864, 1152],
                    "4:5 Portrait (896×1120)": [896, 1120],
                    "5:12 Portrait (640×1536)": [640, 1536],
                    "7:9 Portrait (896×1152)": [896, 1152],
                    "9:16 Portrait (768×1344)": [768, 1344],
                    "13:19 Portrait (832×1216)": [832, 1216],
                    "3:2 Landscape (1224×816)": [1224, 816],
                    "4:3 Landscape (1152×864)": [1152, 864],
                    "16:9 Landscape (1344×768)": [1344, 768],
                    "21:9 Landscape (1536×640)": [1536, 640]
                };

                const refreshUIValues = () => {
					// Take values ONLY from hidden widgets (guarantee of output accuracy)
                    const curW = Math.round(widthWidget.value || 0);
                    const curH = Math.round(heightWidget.value || 0);
                    
                    // Synchronize displays of custom controls
                    widthCtrl.updateDisplay(curW);
                    heightCtrl.updateDisplay(curH);
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

                // --- Event Handlers ---
                const hookUpdate = (w, extraAction) => {
                    if (!w) return;
                    const orig = w.callback;
                    w.callback = function() {
                        if (orig) orig.apply(this, arguments);
                        if (extraAction) extraAction();
                        refreshUIValues();
                    };
                };

                // When step or align toggle changes, RECALCULATE current values
                hookUpdate(stepWidget, () => {
                    // Force apply new step to current values
                    const [fw, fh] = applyConstraints(widthWidget.value, heightWidget.value);
                    widthWidget.value = fw;
                    heightWidget.value = fh;
                });
                
                hookUpdate(alignWidget, () => {
                    const [fw, fh] = applyConstraints(widthWidget.value, heightWidget.value);
                    widthWidget.value = fw;
                    heightWidget.value = fh;
                });

                hookUpdate(multWidget);
                hookUpdate(mpWidget);
                if (presetWidget) {
                    const origPresetCb = presetWidget.callback;
                    presetWidget.callback = function(v) {
                        if (origPresetCb) origPresetCb.apply(this, arguments);
                        if (presetResolutions[v]) {
                            const [resW, resH] = presetResolutions[v];
                            const [finalW, finalH] = applyConstraints(resW, resH);
                            widthWidget.value = finalW;
                            heightWidget.value = finalH;
							// Reset the selector value back to 'Custom / None'
                            setTimeout(() => {
                                commitValue(presetWidget, "Custom / None");
                                node.setDirtyCanvas(true, true);
                            }, 50);
                        }
                    };
                }

                const commitValue = (widget, val) => {
                    widget.value = val;
                    if (widget.callback) widget.callback(val);
                    refreshUIValues();
                };

                // Create buttons
                const btnReadResolution = node.addWidget("button", "Read Image Resolution", null, () => {
                    const imageInputIndex = node.inputs ? node.inputs.findIndex(i => i.name === "image") : -1;
                    if (imageInputIndex === -1) return;

                    const linkId = node.inputs[imageInputIndex].link;
                    if (linkId != null && app.graph.links && app.graph.links[linkId]) {
                        const link = app.graph.links[linkId];
                        const originNode = app.graph.getNodeById(link.origin_id);
                        if (originNode) {
							let fw, fh;
                            if (originNode.imgs && originNode.imgs.length > 0 && originNode.imgs[0].naturalWidth) {
                                fw = originNode.imgs[0].naturalWidth;
                                fh = originNode.imgs[0].naturalHeight;
                            } else {
                                // Fallback to widgets
                                const origW = originNode.widgets?.find(w => w.name === "width" || w.name === "image_width")?.value;
                                const origH = originNode.widgets?.find(w => w.name === "height" || w.name === "image_height")?.value;
                                if (origW && origH) {
                                    fw = origW;
                                    fh = origH;
                                }
                            }

                            if (fw && fh) {
                                const [constrainedW, constrainedH] = applyConstraints(fw, fh);
                                widthWidget.value = constrainedW;
                                heightWidget.value = constrainedH;
								refreshUIValues();
                            }
                        }
                    }
                    node.setDirtyCanvas(true, true);
                });

                const btnSwap = node.addWidget("button", "Swap Width / Height", null, () => {
                    const [fw, fh] = applyConstraints(heightWidget.value, widthWidget.value);
                    widthWidget.value = fw;
                    heightWidget.value = fh;
                    refreshUIValues();
                    node.setDirtyCanvas(true, true);
                });

                // Apply buttons now use the same applyConstraints logic as previews
                const btnApplyMult = node.addWidget("button", "Apply Multiplier", null, () => {
                    const m = multWidget ? multWidget.value : 1.0;
                    const [fw, fh] = applyConstraints(widthWidget.value * m, heightWidget.value * m);
                    widthWidget.value = fw;
                    heightWidget.value = fh;
                    refreshUIValues();
                    node.setDirtyCanvas(true, true);
                });


                const btnApplyMp = node.addWidget("button", "Apply Megapixels (MP)", null, () => {
                    const targetMP = mpWidget ? mpWidget.value : 1.0;
                    const curW = widthWidget.value;
                    const curH = heightWidget.value;
                    const currentMP = (curW * curH) / 1000000;
                    const scaleFactor = currentMP > 0 ? Math.sqrt(targetMP / currentMP) : 1;
                    const [fw, fh] = applyConstraints(curW * scaleFactor, curH * scaleFactor);
                    widthWidget.value = fw;
                    heightWidget.value = fh;
                    refreshUIValues();
                    node.setDirtyCanvas(true, true);
                });

                // Reorder widgets
                const reorderWidgets = () => {
                    node.widgets = [
                        infoMainWidget,
                        widthDomWidget,
                        heightDomWidget,
                        stepWidget,
                        alignWidget,
                        btnSwap,
                        presetWidget,
                        infoMultWidget,
                        multWidget,
                        btnApplyMult,
                        infoMpWidget,
                        mpWidget,
                        btnApplyMp,
                        btnReadResolution,
                        widthWidget, // Hidden, but important for output
                        heightWidget // Hidden, but important for output
					].filter(Boolean);
                };

                // --- Initialization ---
                
                // 1. Apply steps and boundaries immediately
                
                // 2. Reorder widgets
                reorderWidgets();
                
                // 3. Update UI
                refreshUIValues();
                
                // 4. Set size
				node.setSize([320, 560]);
				// Minimum thresholds for your grid
				const MIN_WIDTH = 320;
				const FIXED_HEIGHT = 520;

				// 1. Starting size when creating a node
				node.setSize([Math.max(MIN_WIDTH, node.size[0]), FIXED_HEIGHT]);

				// 2. Controlling user resizing
				node.onResize = function(size) {
					// If the user compresses the width less than the limit, hold it
					if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
					// Fix the height tightly, no matter what the user does
					size[1] = FIXED_HEIGHT;
				};

				// 3. Automatic recalculation control by the engine (when the canvas is updated)
				node.computeSize = function() {
					// Take the current node width
					const currentWidth = this.size ? this.size[0] : MIN_WIDTH;
					// Return it, but always reset the altitude to 520
					return [Math.max(MIN_WIDTH, currentWidth), FIXED_HEIGHT];
				};



                // --- RESTORING STATE ---
                const origOnConfigure = node.onConfigure;
                node.onConfigure = function(info) {
                    if (origOnConfigure) origOnConfigure.apply(this, arguments);
                    
                    setTimeout(() => {
                        // On load, force apply constraints to remove "non-multiple" tails
                        const [fw, fh] = applyConstraints(widthWidget.value, heightWidget.value);
                        widthWidget.value = fw;
                        heightWidget.value = fh;
                        refreshUIValues();
                        reorderWidgets();
                        node.setDirtyCanvas(true, true);
                    }, 50);
                };
            };
        }
    }
});