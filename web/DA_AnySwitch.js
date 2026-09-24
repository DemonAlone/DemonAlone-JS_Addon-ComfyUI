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
    // Find the first connected input and set its type on the output
    let activeType = "*";
    for (let inp of node.inputs) {
        if (inp.link !== null) {
            // Get the data type from the linked slot
            let link = app.graph.links[inp.link];
            if (link) {
                let originNode = app.graph.getNodeById(link.origin_id);
                let originSlot = originNode.outputs[link.origin_slot];
                activeType = originSlot.type;
                break;
            }
        }
    }
    // Change the output type of the node
    if (node.outputs && node.outputs[0]) {
        node.outputs[0].type = activeType;
        node.outputs[0].name = activeType; //  Optional for visualization
    }
}