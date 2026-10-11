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

                    container.innerHTML = `
                        <div class="img-b-wrapper" style="position:absolute; width:100%; height:100%; top:0; left:0; display:flex; justify-content:center; align-items:center;">
                            <img class="img-b" style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; pointer-events:none;" />
                        </div>
                        <div class="img-a-wrapper" style="position:absolute; width:50%; height:100%; top:0; left:0; overflow:hidden; border-right:2px solid #ffffff; display:flex; align-items:center;">
                            <img class="img-a" style="position:absolute; height:100%; top:0; left:0; width:auto; object-fit:contain; pointer-events:none;" />
                        </div>
                        <input type="range" class="slider" min="0" max="100" value="50" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:ew-resize; margin:0; padding:0; z-index:10;" />
                        <div class="batch-router" style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); z-index:20; background:rgba(0,0,0,0.75); padding:4px 10px; border-radius:6px; display:none; align-items:center; gap:10px; color:#fff; font-family:sans-serif; font-size:12px; border:1px solid #444;">
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
                    const imgA = container.querySelector(".img-a");
                    
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

                    const syncImagesWidth = () => {
                        if (container && container.clientWidth > 0) {
                            imgA.style.width = `${container.clientWidth}px`;
                        }
                    };

                    // No need to touch widget.block.style, it breaks LiteGraph logic.
                    this.onResize = function(size) {
                        syncImagesWidth();
                    };

                    slider.addEventListener("input", (e) => {
                        imgAWrapper.style.width = `${e.target.value}%`;
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
                        batchInfo.innerText = `Batch: ${currentIdx + 1} / ${this.comparer_dataset.length}`;
                    } else {
                        batchRouter.style.display = "none";
                    }
                    
                    setTimeout(() => {
                        if (container && container.clientWidth > 0) {
                            imgA.style.width = `${container.clientWidth}px`;
                        }
                    }, 25);
                }
            };
            nodeType.prototype.computeSize = function () {
                // Return the safe absolute minimum.
                return [200, 200]; 
            };
        }
    }
});