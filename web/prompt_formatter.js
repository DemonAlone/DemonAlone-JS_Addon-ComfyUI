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
    result = result.replace(/([.,])([a-zA-Zа-яА-Я0-9])/g, "$1 $2");
	
	// 5. Remove spaces immediately after opening parentheses/brackets and before closing
    result = result.replace(/\(\s+/g, '(');
    result = result.replace(/\s+\)/g, ')');
    result = result.replace(/\[\s+/g, '[');
    result = result.replace(/\s+\]/g, ']');
	
	// 6. Remove spaces before punctuation marks (periods and commas)
    result = result.replace(/\s+([.,])/g, "$1");

    // 6.1. Remove spaces before closing quotes and brackets
    result = result.replace(/\s+(["'])/g, "$1");
    result = result.replace(/\s+([)\]])/g, "$1");

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
        const newResult = result.replace(
			regex,
            (full, opens, content, closes) => {
                const pairs = Math.min(opens.length, closes.length);
                if (pairs < 2) return full;
                const weight = Math.pow(factor, pairs);
                return `${open}${content}:${weight.toFixed(2)}${close}`;
            }
        );
        if (newResult !== result) {
            changed = true;
            result = newResult;
        }
    }
    return result;
}

// ------------------------------------------------------------
// Extension registration (similar to LoopController)
// ------------------------------------------------------------
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

                // Save reference to the text widget in the node
                this._textWidget = textWidget;

                // Button "Format prompt"
                this.addWidget("button", "✔ Format prompt", "format", () => {
                    //  Save current value for undo operation
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

                // Button "Undo last change"
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
                // console.log("[DA_PromptFormatter] Buttons added");
            };
        }
    }
});

console.log("[DA_PromptFormatter] Extension loaded [END]");