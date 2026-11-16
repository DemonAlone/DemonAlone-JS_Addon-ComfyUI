import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

console.log("[LoopControllerUI] Extension loaded");

app.registerExtension({
	name: "Comfy.LoopControllerUI",
	async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
		if (nodeData.name === "SimpleLoopController") {
			function syncWidget(node, widget, value) {
				widget.value = value;
				if (!node.widgets_values) {
					node.widgets_values = node.widgets.map((w) => w.value);
				}
				const index = node.widgets.indexOf(widget);
				if (index !== -1) {
					node.widgets_values[index] = value;
				} else {
					for (let i = 0; i < node.widgets.length; i++) {
						if (node.widgets[i].name === widget.name) {
							node.widgets_values[i] = value;
							break;
						}
					}
				}
				if (widget.callback) {
					widget.callback(value, node);
				}
				console.log(
					"[LoopUI] syncWidget:",
					widget.name,
					"=",
					value,
					"widgets_values:",
					node.widgets_values,
				);
			}

			const origNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function (...args) {
				if (origNodeCreated) {
					origNodeCreated.apply(this, args);
				}

				this.loopTimeout = null;

				this.addWidget("button", "🛑 Abort Loop", "abort", () => {
					console.log(
						"[LoopUI] Abort clicked – executing two-step interrupt+clear sequence",
					);

					if (this.loopTimeout) {
						clearTimeout(this.loopTimeout);
						this.loopTimeout = null;
					}

					// Step 1: Interrupt current execution (without clearing the queue)
					// This allows the server to switch to the next step in the queue (if any)
					api
						.fetchApi("/interrupt", { method: "POST" })
						.then(() => {
							console.log("[LoopUI] Interrupt sent (first)");
							// Wait 2000 ms for the server to start switching
							setTimeout(() => {
								// Step 2: Clear queue
								api
									.fetchApi("/queue", {
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ clear: true }),
									})
									.then(() => {
										console.log("[LoopUI] Queue cleared");
										// Step 3: Second interrupt
										setTimeout(() => {
											api
												.fetchApi("/interrupt", { method: "POST" })
												.then(() => {
													console.log("[LoopUI] Second interrupt sent");
													// Step 4: Reset current_step to -1
													const stepWidget = this.widgets.find(
														(w) => w.name === "current_step",
													);
													if (stepWidget) {
														syncWidget(this, stepWidget, -1);
													}
													this.setDirtyCanvas?.(true, true);
													appInstance.canvas?.setDirty(true, true);
													console.log("[LoopUI] Reset complete, node idle");
												})
												.catch((err) =>
													console.error(
														"[LoopUI] Second interrupt error:",
														err,
													),
												);
										}, 300);
									})
									.catch((err) =>
										console.error("[LoopUI] Queue clear error:", err),
									);
							}, 2000);
						})
						.catch((err) =>
							console.error("[LoopUI] First interrupt error:", err),
						);
				});
			};

			const origOnExecuted = nodeType.prototype.onExecuted;
			nodeType.prototype.onExecuted = function (message, ...args) {
				if (origOnExecuted) {
					origOnExecuted.call(this, message, ...args);
				}

				console.log("[LoopUI] onExecuted message:", message);

				if (message?.next_step !== undefined) {
					const nextStep = message.next_step[0];
					const isFinished = message.is_finished[0];
					console.log(
						`[LoopUI] nextStep=${nextStep}, isFinished=${isFinished}`,
					);

					const widget = this.widgets.find((w) => w.name === "current_step");
					if (widget) {
						syncWidget(this, widget, nextStep);
						appInstance.canvas?.setDirty(true, true);
					}

					if (isFinished === 0) {
						console.log("[LoopUI] Queuing next step immediately");
						appInstance.queuePrompt(0, 1);
					} else {
						console.log("[LoopUI] Loop finished – no more steps");
					}
				}
			};
		}
	},
});
