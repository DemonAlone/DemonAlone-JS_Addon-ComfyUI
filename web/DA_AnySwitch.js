import { app } from "../../scripts/app.js";

console.log("[DA_AnySwitch] Extension loaded");

app.registerExtension({
    name: "Comfy.DA_AnySwitch",
    async nodeCreated(node, app) {
        if (node.comfyClass === "DA_AnySwitch") {
            
            // Function to check and add new inputs when needed
            const checkInputs = () => {
                let inputs = node.inputs;
				if (!inputs || inputs.length === 0) return;
                
                let lastSlotIndex = inputs.length - 1;
                
                // Using the modern node.getInputLink method instead of directly inspecting .link
                if (node.getInputLink(lastSlotIndex) !== null) {
                    let newIndex = inputs.length + 1;
                    node.addInput(`input_${newIndex}`, "*");
                }
            };

            // Hook for connection changes (plugging/unplugging wires)
            const originalOnConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function(type, index, connected, link_info) {
                if (originalOnConnectionsChange) {
                    originalOnConnectionsChange.apply(this, arguments);
                }
                
                // 1 means INPUT in ComfyUI / LiteGraph API
                if (type === 1) { 
                    checkInputs();
                }
                
                // Logic to type the output based on the connected element's type
                updateOutputType(node);
            };
        }
    }
});

function updateOutputType(node) {
    let activeType = "*";
    
	if (!node.inputs) return;
    // 1. Find the first connected input and determine its type
	for (let slotIndex = 0; slotIndex < node.inputs.length; slotIndex++) {
        let linkId = node.getInputLink(slotIndex); // Securely obtaining a link ID
        
        if (linkId !== null && linkId !== undefined) {
            let link = app.graph.links[linkId];
            if (link) {
                let originNode = app.graph.getNodeById(link.origin_id);
                if (originNode && originNode.outputs && originNode.outputs[link.origin_slot]) {
                    let originSlot = originNode.outputs[link.origin_slot];
                    activeType = originSlot.type;
                    break;
                }
            }
        }
    }

    // 2. If an output exists, update its type and display name
	if (node.outputs && node.outputs[0]) {
        let output = node.outputs[0];
        
        if (output.type !== activeType) {
            output.type = activeType;
			// Update the name and label if the engine supports both fields
            output.name = activeType;
            output.label = activeType; 
            
            // Recalculate the node's dimensions in the new UI
            if (typeof node.computeSize === "function") {
                node.size = node.computeSize();
            }
            
            node.setDirtyCanvas(true, true);
        }
    }
}