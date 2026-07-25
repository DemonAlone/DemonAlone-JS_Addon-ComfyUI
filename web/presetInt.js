import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PresetIntNode",
    async nodeCreated(node) {
        if (node.comfyClass !== "PresetIntNode") return;

        const PRESETS = {
            "Seed (0 - 4294967295, step 1)": { min: 0, max: 0xFFFFFFFFFFFFFFFF, step: 1, precision: 0, default: 0 },
            "Steps (1 - 10000, step 1)": { min: 1, max: 10000, step: 1, precision: 0, default: 28 },
        };

        const presetWidget = node.widgets.find(w => w.name === "preset");
        if (!presetWidget) return;

        // Fixing the minimum node width
        const MIN_WIDTH = 310;
        const originalComputeSize = node.computeSize;
        node.computeSize = function() {
            const size = originalComputeSize ? originalComputeSize.apply(this, arguments) : [200, 100];
            size[0] = Math.max(size[0], MIN_WIDTH);
            return size;
        };

        const updateValueWidget = () => {
            const selectedPresetName = presetWidget.value;
            const config = PRESETS[selectedPresetName] || PRESETS[Object.keys(PRESETS)[0]];

            let existingValueWidget = node.widgets.find(w => w.name === "value");
            let currentValue = existingValueWidget ? Number(existingValueWidget.value) : config.default;

            // Ensure current value is within bounds before creating new widget
            if (currentValue < config.min) currentValue = config.min;
            if (currentValue > config.max) currentValue = config.max;

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
