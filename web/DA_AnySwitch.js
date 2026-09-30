import { app } from "../../scripts/app.js";

console.log("[DA_AnySwitch] Extension loaded");

app.registerExtension({
    name: "Comfy.DA_AnySwitch",
    async nodeCreated(node, app) {
        if (node.comfyClass === "DA_AnySwitch") {
            
            // Function to automatically add new inputs
            const checkInputs = () => {
                let inputs = node.inputs;
                if (!inputs || inputs.length === 0) return;
                
                let lastSlotIndex = inputs.length - 1;
                
                // Safe request for link via official API
                if (typeof node.getInputLink === "function" && node.graph) {
                    if (node.getInputLink(lastSlotIndex) !== null) {
                        let newIndex = inputs.length + 1;
                        node.addInput(`input_${newIndex}`, "*");
                    }
                }
            };

            // Hook for connection changes (plugging/unplugging cables)
            const originalOnConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function(type, index, connected, link_info) {
                // protection against recreate / clone bug: If ComfyUI passes corrupted link data
                if (!link_info || typeof link_info !== "object" || !this.graph) {
                    return;
                }

                if (originalOnConnectionsChange) {
                    originalOnConnectionsChange.apply(this, arguments);
                }
                
                // 1 means INPUT (input) in ComfyUI
                if (type === 1) { 
                    checkInputs();
                }
                
                // Instantly pass live link_info for accurate determination of color and slot type
                updateOutputType(node, link_info, connected);
            };
        }
    }
});

function updateOutputType(node, currentLinkInfo, isConnected) {
    let activeType = "*";
    
    // Soft protection against errors when duplicating/cloning the node in memory
    if (!node.inputs || !node.graph) return;
    
    // Scenario A: Cable just connected — get type directly from event (without waiting for graph base)
    if (isConnected && currentLinkInfo) {
        let originNode = node.graph.getNodeById(currentLinkInfo.origin_id);
        if (originNode && originNode.outputs && originNode.outputs[currentLinkInfo.origin_slot]) {
            activeType = originNode.outputs[currentLinkInfo.origin_slot].type;
        }
    } else {
        // Scenario B: Cable disconnected or graph loading — scan remaining inputs in order
        for (let slotIndex = 0; slotIndex < node.inputs.length; slotIndex++) {
            if (typeof node.getInputLink === "function") {
                let linkId = node.getInputLink(slotIndex);
                if (linkId !== null && linkId !== undefined) {
                    let graph = node.graph;
                    let link = graph ? graph.links[linkId] : null;
                    if (link) {
                        let originNode = graph.getNodeById(link.origin_id);
                        if (originNode && originNode.outputs && originNode.outputs[link.origin_slot]) {
                            activeType = originNode.outputs[link.origin_slot].type;
                            break;
                        }
                    }
                }
            }
        }
    }

    // 2. If output exists, update its type, color and display name
    if (node.outputs && node.outputs[0]) {
        let output = node.outputs[0];
        
        if (output.type !== activeType) {
            output.type = activeType;
            output.name = activeType;
            output.label = activeType; 
            
            // Recalculate node size under new type name
            if (typeof node.computeSize === "function") {
                node.size = node.computeSize();
            }
            
            // Force canvas to repaint the circle with the correct color
            if (node.setDirtyCanvas) {
                node.setDirtyCanvas(true, true);
            }
        }
    }
}
