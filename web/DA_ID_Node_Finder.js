import { app } from "../../../scripts/app.js";
console.log("[DA_ID_Node_Finder] Extension loader");

const getAllGraphs = (root) => {
    const seen = new Set();
    const result = [];
    const normalizeGraph = (candidate) => {
        if (!candidate) return null;
        if (candidate.graph && (candidate.graph._nodes || candidate.graph.nodes)) return candidate.graph;
        return candidate;
    };
    const visit = (graphLike) => {
        const graph = normalizeGraph(graphLike);
        if (!graph || seen.has(graph)) return;
        seen.add(graph);
        result.push(graph);
        const push = (collection) => {
            if (!collection) return;
            if (collection instanceof Map || collection instanceof Set) {
                collection.forEach((v) => visit(v));
                return;
            }
            if (Array.isArray(collection)) {
                collection.forEach(visit);
                return;
            }
            if (typeof collection !== "string" && typeof collection?.[Symbol.iterator] === "function") {
                for (const v of collection) visit(v);
                return;
            }
            if (typeof collection === "object") {
                Object.values(collection).forEach(visit);
            }
        };
        push(graph.graphs);
        push(graph.subgraphs);
        push(graph._subgraphs);
        const nodes = graph._nodes || graph.nodes;
        if (nodes) {
            const visitNode = (node) => {
                if (!node) return;
                const candidates = [
                    node?.getInnerGraph?.(),
                    node?.subgraph,
                    node?.inner_graph,
                    node?.innerGraph,
                    node?._subgraph,
                    node?.subgraphs,
                ];
                candidates.forEach((c) => {
                    if (!c) return;
                    if (Array.isArray(c)) c.forEach(visit);
                    else visit(c);
                });
            };
            if (Array.isArray(nodes)) nodes.forEach(visitNode);
            else if (nodes instanceof Map || nodes instanceof Set) nodes.forEach((v) => visitNode(v));
            else if (typeof nodes === "object") Object.values(nodes).forEach((v) => visitNode(v));
        }
    };
    visit(root);
    return result;
};

const getGraphNodes = (graph) => {
    if (!graph) return [];
    if (Array.isArray(graph._nodes)) return graph._nodes;
    if (Array.isArray(graph.nodes)) return graph.nodes;
    if (graph._nodes instanceof Map) return Array.from(graph._nodes.values());
    if (graph.nodes instanceof Map) return Array.from(graph.nodes.values());
    if (graph._nodes instanceof Set) return Array.from(graph._nodes.values());
    if (graph.nodes instanceof Set) return Array.from(graph.nodes.values());
    return [];
};

// Search for a node across all detected levels
function findNodeEverywhere(targetId) {
    const graphs = getAllGraphs(app.graph);
    for (const graph of graphs) {
        const nodes = getGraphNodes(graph);
        for (const node of nodes) {
            if (Number(node.id) === Number(targetId)) {
                return { node, graph };
            }
        }
    }
    return null;
}

// General logic of transition to the node
function jumpToNodeId() {
    const input = prompt("Enter the node ID for the transition:");
    if (!input) return;
    
    const numericId = parseInt(input.trim(), 10);
    if (isNaN(numericId)) {
        alert("ID must be a number!");
        return;
    }

    const result = findNodeEverywhere(numericId);
    
    if (result) {
        const { node, graph } = result;
        
       // Switch the active canvas graph if the node is inside the subgraph
        if (app.canvas && app.canvas.graph !== graph) {
            if (typeof app.switchGraph === "function") {
                app.switchGraph(graph);
            } else if (typeof app.canvas.setGraph === "function") {
                app.canvas.setGraph(graph);
            }
        }
        
        // Selection, centering and auto-scale adjustment
        if (app.canvas) {
            app.canvas.selectNode(node);

            // 1. Calculate the correct scale using the CSS dimensions of the canvas container
            const padding = 150; // отступы от краев экрана в пикселях
            const nodeW = (node.size?.[0] || 200) + padding;
            const nodeH = (node.size?.[1] || 100) + padding;
            
            const elW = app.canvas.canvas?.clientWidth || window.innerWidth;
            const elH = app.canvas.canvas?.clientHeight || window.innerHeight;
            
            const scaleX = elW / nodeW;
            const scaleY = elH / nodeH;
            
            // Set the scale (limit the maximum zoom to 1.2 so that giant nodes don't 'stick' to the lens)
            app.canvas.ds.scale = Math.min(scaleX, scaleY, 1.2);

            // 2. Center on the node, taking into account the new scale
            if (typeof app.canvas.centerOnNode === "function") {
                app.canvas.centerOnNode(node);
            } else {
                app.canvas.ds.offset[0] = -node.pos[0] - node.size[0] / 2 + elW / 2;
                app.canvas.ds.offset[1] = -node.pos[1] - node.size[1] / 2 + elH / 2;
            }

            app.canvas.setDirty(true, true);
        }
        console.log(`[DA_ID_Node_Finder] Successful transition to the node #${numericId}`);
    } else {
        alert(`Node with ID ${numericId} was not found in either the main or nested graphs`);
    }
}

app.registerExtension({
    name: "ComfyUI.QDA_ID_Node_Finder_Menu",
    // ✅ NEW: Use the getCanvasMenuItems hook instead of prototype monkey-patching
    getCanvasMenuItems(canvas) {
        return [
            null, // separator
            {
                content: "🔍 Find a node by ID...",
                callback: () => {
                    jumpToManagerIdWrapper(); // или сразу jumpToNodeId()
                }
            }
        ];
    }
});

// A little wrapper to make the function name match the call
function jumpToManagerIdWrapper() {
    jumpToNodeId();
}