import { app } from "../../../scripts/app.js";

console.log("[DA_PromptFormatter] Extension loaded [START]");

const NODE_CLASS = "DA_PromptFormatter";

// Weight coefficients
const WEIGHT_FACTOR = 1.1;
const NEG_FACTOR = 0.9;

// ------------------------------------------------------------
// Weight coefficients
// ------------------------------------------------------------
function formatPrompt(text) {
    if (typeof text !== "string") return text;

    let result = text;

    // 1. Remove consecutive spaces
    result = result.replace(/ {2,}/g, " ");

    // 2. Remove consecutive commas and periods
    result = result.replace(/([.,])\1+/g, "$1");

    // 3. Convert multiple brackets into weights
    result = replaceBracketsWithWeight(result, "(", ")", WEIGHT_FACTOR);
    result = replaceBracketsWithWeight(result, "[", "]", NEG_FACTOR);

	// 4. Add a space after comma/period only if followed strictly by a letter or a digit
	// Protecting any decimals (in both :1.2 and 1.5m scales) by checking the symbols around
	result = result.replace(/([.,])([a-zA-Zа-яА-Я0-9])/g, (match, punct, nextChar, offset, string) => {
		const prevChar = string[offset - 1]; // symbol before period/comma
		
		// If there is a number on the left and a number on the right, it is a fraction skip the replacement.
		if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
			return match;
		}
		
		// In all other cases, add a space
		return punct + " " + nextChar;
	});

	// 5. Remove spaces immediately after opening parentheses/brackets and before closing
    result = result.replace(/\(\s+/g, '(');
    result = result.replace(/\s+\)/g, ')');
    result = result.replace(/\[\s+/g, '[');
    result = result.replace(/\s+\]/g, ']');

	//5.1 collapse random gaps inside the weight structures: 1. 2 -> :1.2
	result = result.replace(/(?<=:)\s*(\d+)\s*\.\s*(\d+)/g, "$1.$2"); 
	result = result.replace(/\s*:\s*(?=\d)/g, ":"); 

	// 6. Remove spaces before punctuation marks (periods and commas)
    result = result.replace(/\s+([.,])/g, "$1");

	// 7. Remove empty lines (collapse multiple newlines, trim leading/trailing newlines)
    // Normalize Windows line endings to Unix
    result = result.replace(/\r\n/g, '\n');
    // Remove spaces/tabs before a newline (so blank lines with whitespace are detected)
    result = result.replace(/[ \t]+\n/g, '\n');
    // Replace two or more consecutive newlines with a single newline
    result = result.replace(/\n{2,}/g, '\n');
    // Remove leading and trailing newlines
    result = result.replace(/^\n+/, '');
    result = result.replace(/\n+$/, '');

    return result;
}

function replaceBracketsWithWeight(text, open, close, factor) {
    let changed = true;
    let result = text;
	// Define static regulars depending on the characters, 
    // so that security scanners don't fall on dynamic RegExp
    const isRound = (open === "(");
    const regex = isRound 
        ? /(\({2,})([^\(\)]*?)(\){2,})/g
        : /(\[{2,})([^\[\]]*?)(\]{2,})/g;
    while (changed) {
        changed = false;
        const newResult = result.replace(regex, (full, opens, content, closes) => {
            const pairs = Math.min(opens.length, closes.length);
            if (pairs < 2) return full;
            const weight = Math.pow(factor, pairs);
            return `${open}${content}:${weight.toFixed(2)}${close}`;
        });
        if (newResult !== result) {
            changed = true;
            result = newResult;
        }
    }
    return result;
}

app.registerExtension({
    name: "DA_PromptFormatter",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // console.log("[DA_PromptFormatter] beforeRegisterNodeDef called for", nodeData.name);
        if (nodeData.name === NODE_CLASS) {
            // console.log("[DA_PromptFormatter] Matched NODE_CLASS");
            // Save original onNodeCreated method
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                //console.log("[DA_PromptFormatter] onNodeCreated called for node", this.id);
                // Call the original method, if it exists
                if (origOnNodeCreated) {
                    origOnNodeCreated.apply(this, arguments);
                }

                // Store reference to the text widget in the node
                // console.log("[DA_PromptFormatter] widgets:", this.widgets ? this.widgets.map(w => w.name) : "no widgets");
                const textWidget = this.widgets.find(w => w.name === "text");
                if (!textWidget) {
                    console.warn("[DA_PromptFormatter] 'text' widget not found");
                    return;
                }
                // console.log("[DA_PromptFormatter] textWidget found");

                // --- BUTTON: Get Text --- (MOVED TO BOTTOM)
                const inputIndex = this.inputs ? this.inputs.findIndex(i => i.name === "text_in") : -1;
                if (inputIndex !== -1 && this.inputs[inputIndex].link) {
                     const linkId = this.inputs[inputIndex].link;
                     const link = app.graph.links[linkId];
                     const originNode = app.graph.getNodeById(link.origin_id);
                     
                     let extractedText = null;
                     if (originNode.type === "PrimitiveNode") {
                         extractedText = originNode.widgets[0].value;
                     } else {
                         const priorityNames = ["text", "prompt", "string", "value", "text_in"];
                         for (const name of priorityNames) {
                             const w = originNode.widgets.find(w => w.name === name);
                             if (w && typeof w.value === "string") {
                                 extractedText = w.value;
                                 break;
                             }
                         }
                         
                         // Fallback: take the first string widget that comes along
                         if (extractedText === null) {
                             const firstStrWidget = originNode.widgets.find(w => typeof w.value === "string");
                             if (firstStrWidget) extractedText = firstStrWidget.value;
                         }
                     }
                     
                     // Paste the found text into the main widget
                     if (extractedText !== null && extractedText !== undefined) {
                         this._textWidget.value = String(extractedText);
                         if (this._textWidget.callback) {
                             this._textWidget.callback(this._textWidget.value);
                         }
                         if (app.canvas) app.canvas.setDirty(true, true);
                         if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                         console.log("[DA_PromptFormatter] Text extracted from", originNode.type);
                     } else {
                         console.warn("[DA_PromptFormatter] Could not extract text from origin node");
                     }
                } else {
                    // Button "Get Text" logic only if connected, otherwise just create button with no-op or disabled state
                    // To keep the button visible but inactive if not connected:
                    this.addWidget("button", "📥 Get Text", "get_text_placeholder", () => {
                        console.warn("[DA_PromptFormatter] 'text_in' input is not connected, cannot extract text.");
                    });
                }

                // --- BUTTON: Format prompt ---
                this.addWidget("button", "✔ Format prompt", "format", () => {
                    // Save current value for undo operation
                    this._lastFormattedValue = this._textWidget.value;
                    const formatted = formatPrompt(this._textWidget.value);
                    this._textWidget.value = formatted;

                    // Call callback to update output
                    if (this._textWidget.callback) {
                        this._textWidget.callback(formatted);
                    }

                    // Call callback to update output
                    if (app.canvas) app.canvas.setDirty(true, true);
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    console.log("[DA_PromptFormatter] Format done");
                });

                // --- BUTTON: Undo last change ---
                this.addWidget("button", "🔙 Undo last change", "undo", () => {
                    if (this._lastFormattedValue !== undefined) {
                        this._textWidget.value = this._lastFormattedValue;
                        if (this._textWidget.callback) {
                            this._textWidget.callback(this._lastFormattedValue);
                        }
                        if (app.canvas) app.canvas.setDirty(true, true);
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    } else {
                        console.warn("[DA_PromptFormatter] No saved state for undo");
                    }
                });
            };
        }
    },
    
    // Override onNodeCreated completely to ensure clean order
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === NODE_CLASS) {
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function() {
                if (origOnNodeCreated) {
                    origOnNodeCreated.apply(this, arguments);
                }

                const textWidget = this.widgets.find(w => w.name === "text");
                if (!textWidget) return;

                this._textWidget = textWidget;
                
                // 1. Format Button
                this.addWidget("button", "✔ Format prompt", "format", () => {
                    this._lastFormattedValue = this._textWidget.value;
                    const formatted = formatPrompt(this._textWidget.value);
                    this._textWidget.value = formatted;
                    if (this._textWidget.callback) this._textWidget.callback(formatted);
                    if (app.canvas) app.canvas.setDirty(true, true);
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                });

                // 2. Undo Button
                this.addWidget("button", "🔙 Undo last change", "undo", () => {
                    if (this._lastFormattedValue !== undefined) {
                        this._textWidget.value = this._lastFormattedValue;
                        if (this._textWidget.callback) this._textWidget.callback(this._lastFormattedValue);
                        if (app.canvas) app.canvas.setDirty(true, true);
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    } else {
                        console.warn("[DA_PromptFormatter] No saved state for undo");
                    }
                });

                // 3. Get Text Button (MOVED TO BOTTOM)
                const inputIndex = this.inputs ? this.inputs.findIndex(i => i.name === "text_in") : -1;
                
                this.addWidget("button", "📥 Get Text", "get_text", () => {
                    if (inputIndex === -1 || !this.inputs[inputIndex].link) {
                        console.warn("[DA_PromptFormatter] 'text_in' input not found or not connected");
                        return;
                    }
                    
                    const linkId = this.inputs[inputIndex].link;
                    const link = app.graph.links[linkId];
                    const originNode = app.graph.getNodeById(link.origin_id);
                    
                    if (!originNode) {
                        console.warn("[DA_PromptFormatter] Origin node not found");
                        return;
                    }
                    
                    let extractedText = null;
                    
                    if (originNode.type === "PrimitiveNode") {
                        extractedText = originNode.widgets[0].value;
                    } else {
                         const priorityNames = ["text", "prompt", "string", "value", "text_in"];
                         for (const name of priorityNames) {
                             const w = originNode.widgets.find(w => w.name === name);
                             if (w && typeof w.value === "string") {
                                 extractedText = w.value;
                                 break;
                             }
                         }
                         
                         // Fallback
                         if (extractedText === null) {
                             const firstStrWidget = originNode.widgets.find(w => typeof w.value === "string");
                             if (firstStrWidget) extractedText = firstStrWidget.value;
                         }
                    }
                    
                    if (extractedText !== null && extractedText !== undefined) {
                        this._textWidget.value = String(extractedText);
                        if (this._textWidget.callback) {
                            this._textWidget.callback(this._textWidget.value);
                        }
                        if (app.canvas) app.canvas.setDirty(true, true);
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                        console.log("[DA_PromptFormatter] Text extracted from", originNode.type);
                    } else {
                        console.warn("[DA_PromptFormatter] Could not extract text from origin node");
                    }
                });

            };
        }
    }
});

console.log("[DA_PromptFormatter] Extension loaded [END]");
