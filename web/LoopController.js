import { app } from "../../../scripts/app.js";
console.log("[LoopControllerUI] Extension loaded");

app.registerExtension({
    name: "Comfy.LoopControllerUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SimpleLoopController") { 
            
            // Abort flag for this specific node instance
            nodeType.prototype.isAborted = false;

            // Add an ABORT button to the node interface upon creation
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origNodeCreated) {
                    origNodeCreated.apply(this, arguments);
                }

                const self = this;
                // Add an interactive button to the node interface
                this.addWidget("button", "🛑 Abort Loop", "abort", () => {
                    self.isAborted = true;
                    console.log("[LoopUI] User clicked Abort. Queue will be stopped.");
                    
                    // Reset the current step widget to 0 visually
                    const stepWidget = self.widgets.find(w => w.name === "current_step");
                    if (stepWidget) {
                        stepWidget.value = 0;
                        if (self.setDirtyCanvas) {
                            self.setDirtyCanvas(true, true);
                        }
                    }
                });
            };

            const origOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                if (origOnExecuted) {
                    origOnExecuted.apply(this, arguments);
                }

                // If user clicked Abort — halt further executions
                if (this.isAborted) {
                    console.log("[LoopUI] Cycle interrupted by user. New tasks will not be added to the queue.");
                    this.isAborted = false; // Reset flag for future manual runs
                    return;
                }

                if (message && message.next_step !== undefined) {
                    const nextStep = message.next_step[0];
                    const isFinished = message.is_finished[0];

                    const widget = this.widgets.find(w => w.name === "current_step");
                    if (widget) {
                        widget.value = nextStep;
                        if (this.setDirtyCanvas) {
                            this.setDirtyCanvas(true, true);
                        }
                    }

                    // If cycle is not finished and no abort signal — run again
                    if (isFinished === 0 && !this.isAborted) {
                        setTimeout(() => {
                            app.queuePrompt(0, 1);
                        }, 100);
                    }
                }
            };
        }
    }
});
