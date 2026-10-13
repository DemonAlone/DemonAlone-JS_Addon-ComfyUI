import { app } from "../../scripts/app.js";

console.log("[DA_SaveImage] Extension loaded");

// The frontend only expands %date:yyyy-MM-dd% / %Node.widget% in filename_prefix for
// its own list of save nodes. Do the same here so the prefix behaves like Save Image.

app.registerExtension({
  name: "DA_SaveImage",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DA_SaveImage") return;

    let replace = window.comfyAPI?.utils?.applyTextReplacements;
    if (!replace) {
      try {
        replace = (await import("../../scripts/utils.js")).applyTextReplacements;
      } catch {
        replace = null;
      }
    }
    if (!replace) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      const widget = this.widgets?.find((w) => w.name === "filename_prefix");
      if (widget) widget.serializeValue = () => replace(app.graph, widget.value);
      return result;
    };
  },
});