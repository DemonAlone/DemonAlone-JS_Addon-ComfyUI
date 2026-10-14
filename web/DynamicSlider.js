import { app } from "../../../scripts/app.js";

console.log("[DA_DynamicSlider] Extension loaded");

app.registerExtension({
    name: "DA_DynamicSliderNode",
    async nodeCreated(node) {
        if (node.comfyClass !== "DA_DynamicSliderNode") return;

		// Find all widgets
        const typeWidget = node.widgets.find(w => w.name === "type");
        
        // INT group
        const valInt = node.widgets.find(w => w.name === "value_int");
        const minInt = node.widgets.find(w => w.name === "min_int");
        const maxInt = node.widgets.find(w => w.name === "max_int");
        const stepInt = node.widgets.find(w => w.name === "step_int");

        // FLOAT group
        const valFloat = node.widgets.find(w => w.name === "value_float");
        const minFloat = node.widgets.find(w => w.name === "min_float");
        const maxFloat = node.widgets.find(w => w.name === "max_float");
        const stepFloat = node.widgets.find(w => w.name === "step_float");

        if (!valInt || !valFloat) return;

		// Visibility and border update function
        const updateVisibilityAndBounds = () => {
            const isInt = typeWidget.value === "INT";

			// 1. Hide/show widgets
            [valInt, minInt, maxInt, stepInt].forEach(w => { if(w) w.hidden = !isInt; });
            [valFloat, minFloat, maxFloat, stepFloat].forEach(w => { if(w) w.hidden = isInt; });

			// 2. Update the borders and step of the active slider
            if (isInt) {
                const min = parseInt(minInt.value) || 0;
                const max = parseInt(maxInt.value) || 100;
                const step = parseInt(stepInt.value) || 1;

                // // Update all widget parameters
                valInt.options.min = min;
                valInt.options.max = max;
                valInt.options.step = step;
                valInt.options.step2 = step; // Critical for mouse scrolling
                valInt.options.precision = 0;

                // Clamp и Snap to step
                let v = parseInt(valInt.value) || min;
                if (v < min) v = min;
                if (v > max) v = max;
                if (step > 0) {
                    v = min + Math.round((v - min) / step) * step;
                }
                valInt.value = v;

            } else {
                const min = parseFloat(minFloat.value) || 0.0;
                const max = parseFloat(maxFloat.value) || 1.0;
                const step = parseFloat(stepFloat.value) || 0.01;

                valFloat.options.min = min;
                valFloat.options.max = max;
                valFloat.options.step = step;
                valFloat.options.step2 = step;
                
                // Calculation precision
                const stepStr = step.toString();
                const dotIndex = stepStr.indexOf('.');
                const precision = dotIndex !== -1 ? stepStr.length - dotIndex - 1 : 0;
                valFloat.options.precision = Math.min(precision, 6);

                // Clamp and Snap to step
                let v = parseFloat(valFloat.value) || min;
                if (v < min) v = min;
                if (v > max) v = max;
                if (step > 0) {
                    v = min + Math.round((v - min) / step) * step;
                    v = parseFloat(v.toFixed(valFloat.options.precision));
                }
                valFloat.value = v;
            }

            // 3. Force widget UI update trigger
            // LiteGraph sometimes ignores options changes until value changes
            if (isInt) {
                valInt.value = valInt.value; 
            } else {
                valFloat.value = valFloat.value;
            }

            node.setDirtyCanvas(true, true);
        };

        // Hooks for changing all control widgets
        const hookUpdate = (w) => {
            if (!w) return;
            const orig = w.callback;
            w.callback = function() {
                if (orig) orig.apply(this, arguments);
                updateVisibilityAndBounds();
            };
        };

        hookUpdate(typeWidget);
        hookUpdate(minInt); hookUpdate(maxInt); hookUpdate(stepInt);
        hookUpdate(minFloat); hookUpdate(maxFloat); hookUpdate(stepFloat);

        // Subgraph support: onConfigure
        const originalOnConfigure = node.onConfigure;
        node.onConfigure = function(info) {
            if (originalOnConfigure) originalOnConfigure.apply(this, arguments);
            setTimeout(updateVisibilityAndBounds, 50);
        };

        // Primary initialization
        updateVisibilityAndBounds();
    }
});