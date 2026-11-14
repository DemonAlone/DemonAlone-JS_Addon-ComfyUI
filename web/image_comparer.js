import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "MyCustomExtension.DA_ImageComparer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "DA_ImageComparer") {
            console.log("[DA_Image_comparer] Extension loaded");
            
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (output) {
                onExecuted?.apply(this, arguments);
                if (output?.comparer_data) {
                    this.comparer_dataset = output.comparer_data;
                    this.customImageIndex = 0; 
                    this.updateComparerUI();
                }
            };

            nodeType.prototype.updateComparerUI = function () {
                if (!this.comparer_dataset || this.comparer_dataset.length === 0) {
                    let widget = this.widgets?.find(w => w.name === "html_comparer");
                    if (widget) widget.element.innerHTML = "";
                    return;
                }

                let widget = this.widgets?.find(w => w.name === "html_comparer");
                if (!widget) {
                    const container = document.createElement("div");
                    container.className = "autonomous-comparer-container";

                    // safe styles for litegraph
                    container.style.position = "relative";
                    container.style.width = "100%";
                    // In LiteGraph there is no need to manually subtract 45px via calc. The widget itself is already placed below the header.
                    container.style.height = "100%"; 
                    container.style.overflow = "hidden";
                    // CRITICAL: We prohibit the container from having a minimum height, otherwise it will stretch the node to fit the size of the images.
                    container.style.minHeight = "0"; 
                    container.style.userSelect = "none";
                    container.style.boxSizing = "border-box";
                    container.style.backgroundColor = "#13131c";
                    container.style.borderRadius = "4px";

                    // Common styles for both images to ensure that they match pixels
                    const commonImgStyle = "max-width:100% !important; max-height:100% !important; width:auto; height:auto; object-fit:contain; pointer-events:none; display:block;";

                    container.innerHTML = `
                        <div class="img-b-wrapper" style="position:absolute; inset:0; display:flex; justify-content:center; align-items:center;">
                            <img class="img-b" style="${commonImgStyle}" />
                        </div>
                        <div class="img-a-wrapper" style="position:absolute; inset:0; display:flex; justify-content:center; align-items:center; clip-path: inset(0 50% 0 0);">
                            <img class="img-a" style="${commonImgStyle}" />
                        </div>
                        <div class="divider-line" style="position:absolute; top:0; bottom:0; left:50%; width:2px; background:#ffffff; pointer-events:none; transform:translateX(-1px); z-index:5;"></div>
                        <input type="range" class="slider" min="0" max="100" value="50" style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:ew-resize; margin:0; padding:0; z-index:10;" />
                        <div class="batch-router" style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); z-index:20; background:rgba(0,0,0,0.75); padding:4px 10px; border-radius:6px; display:none; align-items:center; gap:10px; color:#fff; font-family:sans-serif; font-size:12px; border:1px solid #444; white-space:nowrap;">
                            <button class="btn-prev" style="background:#222; color:#fff; border:1px solid #555; padding:2px 8px; border-radius:4px; cursor:pointer;">&lt;</button>
                            <span class="batch-info">1 / 1</span>
                            <button class="btn-next" style="background:#222; color:#fff; border:1px solid #555; padding:2px 8px; border-radius:4px; cursor:pointer;">&gt;</button>
                        </div>
                    `;

                    widget = this.addDOMWidget("html_comparer", "custom", container);
                    // Set the starting size only if the node has just been created
                    
                    if (!this.size || (this.size[0] === 0 && this.size[1] === 0)) {
                        this.size = [400, 400];
                    }

                    const slider = container.querySelector(".slider");
                    const imgAWrapper = container.querySelector(".img-a-wrapper");
                    const dividerLine = container.querySelector(".divider-line");
                    
                    container.querySelector(".btn-prev").addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (this.customImageIndex > 0) {
                            this.customImageIndex--;
                            this.updateComparerUI();
                        }
                    });
                    container.querySelector(".btn-next").addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (this.customImageIndex < this.comparer_dataset.length - 1) {
                            this.customImageIndex++;
                            this.updateComparerUI();
                        }
                    });

                    // Smooth curtain movement without dependence on node resize
                    slider.addEventListener("input", (e) => {
                        const val = e.target.value;
                        imgAWrapper.style.clipPath = `inset(0 ${100 - val}% 0 0)`;
                        dividerLine.style.left = `${val}%`;
                    });
                }

                const container = widget.element;
                const currentIdx = this.customImageIndex || 0;
                const pair = this.comparer_dataset[currentIdx];
                
                if (pair) {
                    const imgA = container.querySelector(".img-a");
                    const imgB = container.querySelector(".img-b");
                    const batchRouter = container.querySelector(".batch-router");
                    const batchInfo = container.querySelector(".batch-info");
                    
                    imgA.src = pair.file_a;
                    imgB.src = pair.file_b;
                    
                    if (this.comparer_dataset.length > 1) {
                        batchRouter.style.display = "flex";
                        let heldTag = "";
                        if (pair.held_a) {
                            heldTag = ` <span style="color:#f5c542; font-weight:600;">• A held</span>`;
                        } else if (pair.held_b) {
                            heldTag = ` <span style="color:#f5c542; font-weight:600;">• B held</span>`;
                        }
                        batchInfo.innerHTML = `${currentIdx + 1} / ${this.comparer_dataset.length}${heldTag}`;
                    } else {
                        batchRouter.style.display = "none";
                    }
                }
            };
            
            nodeType.prototype.computeSize = function () {
                return [200, 200]; 
            };
        }
    }
});
