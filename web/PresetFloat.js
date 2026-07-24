import { app } from "../../../scripts/app.js";
// console.log("[PresetFloatNode] Extension loaded");

app.registerExtension({
    name: "Comfy.PresetFloatNode",
    async nodeCreated(node) {
        if (node.comfyClass !== "PresetFloatNode") return;

        const PRESETS = {
            "Denoise (0.0 - 1.0, step 0.01)": { min: 0.0, max: 1.0, step: 0.01, precision: 2, default: 0.5 },
            "CFG Scale (1.0 - 30.0, step 0.5)": { min: 1.0, max: 30.0, step: 0.5, precision: 1, default: 8.0 },
            "FPS (1 - 120, step 1)": { min: 1.0, max: 120.0, step: 1.0, precision: 0, default: 24.0 },
            "Strength (0.0 - 2.0, step 0.05)": { min: 0.0, max: 2.0, step: 0.05, precision: 2, default: 1.0 },
        };

        const presetWidget = node.widgets.find(w => w.name === "preset");
        if (!presetWidget) return;

        const updateValueWidget = () => {
            const selectedPresetName = presetWidget.value;
            const config = PRESETS[selectedPresetName] || PRESETS[Object.keys(PRESETS)[0]];

            let existingValueWidget = node.widgets.find(w => w.name === "value");
            let currentValue = existingValueWidget ? Number(existingValueWidget.value) : config.default;

            if (currentValue < config.min) currentValue = config.min;
            if (currentValue > config.max) currentValue = config.max;
            currentValue = Number(currentValue.toFixed(config.precision));

            // Creates a new widget with hard-coded step, precision, and step2 for the mouse
            const newWidget = node.addWidget("number", "value", currentValue, undefined, {
                min: config.min,
                max: config.max,
                step: config.step,
                step2: config.step, // Sync mouse speed with step
                precision: config.precision
            });

            // Forcefully duplicate properties in options for the internal LiteGraph controller
            if (newWidget.options) {
                newWidget.options.step = config.step;
                newWidget.options.step2 = config.step;
                newWidget.options.precision = config.precision;
            }

            // Adds cleanup of connections when the input loses focus
            if (newWidget.inputEl) {
                // Clears connections on click/focus for easy editing
                newWidget.inputEl.addEventListener("focus", () => {
                    let val = Number(newWidget.inputEl.value);
                    if (!isNaN(val)) {
                        val = Number(val.toFixed(config.precision));
                        newWidget.inputEl.value = val;
                    }
                });

                // And locks it upon losing focus
                newWidget.inputEl.addEventListener("blur", () => {
                    let val = Number(newWidget.inputEl.value);
                    if (!isNaN(val)) {
                        if (val < config.min) val = config.min;
                        if (val > config.max) val = config.max;
                        val = Number(val.toFixed(config.precision));
                        newWidget.value = val;
                        newWidget.inputEl.value = val;
                    }
                });
            }

            if (existingValueWidget) {
                const index = node.widgets.indexOf(existingValueWidget);
                node.widgets.splice(index, 1);
                node.widgets.pop(); // Removes the added widget from the end
                node.widgets.splice(index, 0, newWidget);
            } else {
                const pIndex = node.widgets.indexOf(presetWidget);
                node.widgets.pop();
                node.widgets.splice(pIndex + 1, 0, newWidget);
            }

            node.setSize(node.computeSize());
            node.setDirtyCanvas(true, true);
        };

        const originalCallback = presetWidget.callback;
        presetWidget.callback = function() {
            originalCallback?.apply(this, arguments);
            updateValueWidget();
        };

        updateValueWidget();
    }
});
