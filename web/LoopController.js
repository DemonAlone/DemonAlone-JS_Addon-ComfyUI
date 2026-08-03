import { app } from "../../../scripts/app.js";
console.log("[LoopControllerUI] Extension loaded");

app.registerExtension({
    name: "Comfy.LoopControllerUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SimpleLoopController") { 

            // Add an ABORT button and initialize instance-level properties upon creation
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origNodeCreated) {
                    origNodeCreated.apply(this, arguments);
                }

                // initialize the flag strictly for a specific node instance
                this.isAborted = false;

                const self = this;
                this.addWidget("button", "🛑 Abort Loop", "abort", () => {
                    self.isAborted = true;
                    console.log("[LoopUI] User clicked Abort. Stopping queue...");

                    // Signal the ComfyUI server to interrupt the current execution
                    if (app.cancelExecution) {
                        app.cancelExecution();
                    }
                    
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

                // If the interrupt flag is triggered for this particular instance
                if (this.isAborted) {
                    console.log("[LoopUI] Cycle interrupted by user. Halting auto-queue.");
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

                    // If the cycle is not completed and there was no interruption, we queue the next step
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