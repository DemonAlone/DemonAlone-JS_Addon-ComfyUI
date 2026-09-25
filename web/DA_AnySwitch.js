import { app } from "../../scripts/app.js";

console.log("[DA_AnySwitch] Extension loaded");

app.registerExtension({
    name: "Comfy.DA_AnySwitch",
    async nodeCreated(node, app) {
        if (node.comfyClass === "DA_AnySwitch") {
            
            // Function to check and add new inputs when needed
            const checkInputs = () => {
                let inputs = node.inputs;
                let lastInput = inputs[inputs.length - 1];
                
                // If the last input is occupied (linked), add the next one
                if (lastInput && lastInput.link !== null) {
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
                
                // Check if the node needs to grow when connecting to an input slot
                if (type === 1) { // 1 usually means Input in the new API
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
    
    // 1. Find the first connected input and determine its type
    for (let inp of node.inputs) {
        if (inp.link !== null) {
            let link = app.graph.links[inp.link];
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