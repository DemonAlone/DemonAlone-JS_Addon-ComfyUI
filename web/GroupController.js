// based on feature_group_fast_toggle.js from https://github.com/rgthree/rgthree-comfy and AUN_universal_instant.js from https://github.com/loz2754/AUN-ComfyUI-Nodes, MIT.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

console.log("[DA_GroupController] Extension loaded");

const MAX_SLOTS = 20;
const LIST_SPLITTER = /[,;]+/;
const NODE_MODE_VALUES = {
    ALWAYS: globalThis.LiteGraph?.ALWAYS ?? 0,
    NEVER: globalThis.LiteGraph?.NEVER ?? 2,
    BYPASS: 4,
};
const VALID_TOGGLE_RESTRICTIONS = ["default", "max one", "always one"];

const OFF_LABELS = { Bypass: "Bypass 🔴", Mute: "Mute 🔇" };
const ON_LABELS = { Bypass: "Active 🟢", Mute: "Active 🟢" };

const clampInt = (value, min = 1, max = MAX_SLOTS) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.min(max, Math.max(min, Math.round(num)));
};

const getWidget = (node, name) => {
    if (!node || !name) return null;
    const visible = node.widgets?.find((w) => w.name === name);
    if (visible) return visible;
    return node.__DG_widgetLookup?.get(name) || null;
};

const applyWidgetHiddenState = (widget, hidden) => {
    if (!widget) return;
    widget.hidden = hidden;
    widget.__DG_visible = !hidden;
};

const trackWidgetMetadata = (node, widget) => {
    if (!node || !widget) return widget;
    node.__DG_widgetLookup = node.__DG_widgetLookup || new Map();
    node.__DG_allWidgets = node.__DG_allWidgets || [];
    node.__DG_widgetOrderCounter = node.__DG_widgetOrderCounter ?? 0;
    if (widget.name) node.__DG_widgetLookup.set(widget.name, widget);
    if (!node.__DG_allWidgets.includes(widget)) {
        if (!Number.isFinite(widget.__DG_order)) {
            widget.__DG_order = node.__DG_widgetOrderCounter++;
        }
        widget.__DG_visible = widget.__DG_visible !== false;
        node.__DG_allWidgets.push(widget);
    }
    return widget;
};

const syncWidgetVisibility = (node) => {
    if (!node?.__DG_allWidgets) return;
    const sorted = node.__DG_allWidgets
        .filter((w) => w && !w.__DG_removed)
        .sort((a, b) => (a.__DG_order ?? 0) - (b.__DG_order ?? 0));
    node.widgets = sorted;
};

const ensureWidgetTracking = (node) => {
    if (!node || node.__DG_widgetTrackingSetup) return;
    node.__DG_widgetTrackingSetup = true;
    node.widgets = node.widgets || [];
    node.widgets.forEach((w) => trackWidgetMetadata(node, w));
    syncWidgetVisibility(node);
    const originalAddWidget = node.addWidget;
    node.addWidget = function (...args) {
        const widget = originalAddWidget?.apply(this, args);
        if (widget) {
            trackWidgetMetadata(this, widget);
            syncWidgetVisibility(this);
        }
        return widget;
    };
    node.__DG_syncWidgetVisibility = () => syncWidgetVisibility(node);
};

const getAllTrackedWidgets = (node) => node?.__DG_allWidgets || node?.widgets || [];

const hasNamedConnectedConvertedInput = (node, widgetName) => {
    if (!node || !widgetName) return false;
    const inputs = Array.isArray(node.inputs) ? node.inputs : [];
    return inputs.some((input) => input?.name === widgetName && input.widget && input.link != null);
};

const syncWidgetBackedInputVisibility = (node) => {
    if (!node) return;
    const inputs = Array.isArray(node.inputs) ? node.inputs : [];
    inputs.forEach((input) => {
        if (!input?.widget) return;
        const hidden = !!input.widget.hidden;
        input.hidden = hidden;
        input.disabled = hidden && input.link == null;
        input.optional = true;
        if (hidden) {
            input.required = false;
            if (input.__DG_savedType == null) {
                input.__DG_savedType = input.type;
            }
            if (input.link == null) {
                input.type = "__DG_HIDDEN__";
            }
        } else {
            input.required = false;
            if (input.__DG_savedType != null) {
                input.type = input.__DG_savedType;
            }
        }
    });
};

const ensureHiddenAwareWidget = (widget) => {
    if (!widget || widget.__DG_hiddenAware) return;
    const originalCompute = typeof widget.computeSize === "function" ? widget.computeSize : null;
    widget.__DG_hiddenAware = true;
    widget.computeSize = function (...args) {
        const firstArg = args.length ? args[0] : undefined;
        const resolveWidth = () => {
            if (Array.isArray(firstArg) && Number.isFinite(firstArg[0])) return firstArg[0];
            if (Number.isFinite(firstArg)) return firstArg;
            return LiteGraph?.NODE_WIDTH ?? 200;
        };
        if (this.hidden) {
            if (Array.isArray(firstArg)) {
                firstArg[1] = 0;
                return firstArg;
            }
            return [resolveWidth(), 0];
        }
        if (originalCompute) {
            const result = originalCompute.apply(this, args);
            if (Array.isArray(result)) return result;
            if (Array.isArray(firstArg)) return firstArg;
            if (Number.isFinite(result)) return [resolveWidth(), Number(result)];
        }
        return [resolveWidth(), LiteGraph?.NODE_WIDGET_HEIGHT ?? 24];
    };
};

const splitList = (value) => {
    if (!value || typeof value !== "string") return [];
    return value.split(LIST_SPLITTER).map((s) => s.trim()).filter(Boolean);
};

// --- Advanced search for group nodes ---
const getNodesInGroup = (graph, groupName) => {
    if (!graph || !groupName) return [];
    const groups = graph.groups || [];
    const needle = String(groupName).trim().toLowerCase();
    const group = groups.find(g => String(g.title || g.name || "").trim().toLowerCase() === needle);
    if (!group) return [];

    // Get the group boundaries (rectangle)
    // Use _bounding if available, otherwise pos/size
    let rect = group._bounding;
    if (!rect) {
        // If there is no _bounding,  build from pos and size
        const pos = group._pos || group.pos || [0, 0];
        const size = group._size || group.size || [0, 0];
        rect = [pos[0], pos[1], size[0], size[1]];
    }

    let gx, gy, gw, gh;
    if (Array.isArray(rect)) {
        gx = rect[0];
        gy = rect[1];
        gw = rect[2];
        gh = rect[3];
    } else if (rect.x !== undefined) {
        gx = rect.x;
        gy = rect.y;
        gw = rect.width || rect.w;
        gh = rect.height || rect.h;
    } else {
        // console.warn("[DA_GroupController] Unknown rect format", rect);
        return [];
    }

    const allNodes = getGraphNodes(graph);
    return allNodes.filter(node => {
        const nodePos = node.pos || node._pos || [0, 0];
        const nodeSize = node.size || node._size || [0, 0];
        const nx = nodePos[0];
        const ny = nodePos[1];
        const nw = nodeSize[0];
        const nh = nodeSize[1];

        // Checking the intersection of rectangles
        const overlapX = (nx < gx + gw) && (nx + nw > gx);
        const overlapY = (ny < gy + gh) && (ny + nh > gy);
        return overlapX && overlapY;
    });

    // console.log(`[DA_GroupController] Found ${nodesInGroup.length} nodes in group "${groupName}" by geometry`);
};

// --- Helper functions for graphs ---

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

const getInnerGraphsFromNode = (node) => {
    if (!node) return [];
    const candidates = [
        node.type,
        node.getInnerGraph?.(),
        node.subgraph,
        node.inner_graph,
        node.innerGraph,
        node._subgraph,
        node.subgraphs,
    ];
    const graphs = [];
    const push = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        if (value instanceof Map || value instanceof Set) {
            value.forEach((entry) => push(entry));
            return;
        }
        if (typeof value !== "string" && typeof value?.[Symbol.iterator] === "function") {
            for (const entry of value) push(entry);
            return;
        }
        const normalized = value.graph && (value.graph._nodes || value.graph.nodes) ? value.graph : value;
        if (normalized && (normalized._nodes || normalized.nodes)) graphs.push(normalized);
    };
    candidates.forEach(push);
    return graphs;
};

const forEachNodeAndInnerNodes = (node, visitor, visitedGraphs = new Set(), visitedNodes = new Set()) => {
    if (!node || visitedNodes.has(node)) return;
    visitedNodes.add(node);
    visitor(node);
    const innerGraphs = getInnerGraphsFromNode(node);
    innerGraphs.forEach((graph) => {
        if (!graph || visitedGraphs.has(graph)) return;
        visitedGraphs.add(graph);
        getGraphNodes(graph).forEach((innerNode) => {
            forEachNodeAndInnerNodes(innerNode, visitor, visitedGraphs, visitedNodes);
        });
    });
};

const isNodeDisabled = (node, mode) => {
    if (mode === "Mute") return node.mode === NODE_MODE_VALUES.NEVER;
    return node.mode === NODE_MODE_VALUES.BYPASS;
};

const setNodeStateForMode = (node, mode, isActive, stateChanges) => {
    if (!node) return;
    let changed = false;
    const setModeValue = (value) => {
        if (typeof value !== "number") return;
        if (node.mode !== value) {
            node.mode = value;
            changed = true;
        }
    };
    const updateMode = stateChanges?.includes("mute") || stateChanges?.includes("bypass");
    if (isActive) {
        if (updateMode) setModeValue(NODE_MODE_VALUES.ALWAYS);
    } else {
        if (updateMode) {
            if (mode === "Mute") setModeValue(NODE_MODE_VALUES.NEVER);
            else setModeValue(NODE_MODE_VALUES.BYPASS);
        }
    }
    if (changed) {
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
    }
};

const applyUniversalUpdate = (mode, groupsPayload, stateChanges) => {
    if (!Array.isArray(groupsPayload) || !groupsPayload.length) return;
    const graph = app.graph;
    if (!graph) return;

    const updateGroup = (groupName, isActive) => {

        const nodes = getNodesInGroup(graph, groupName); // use advanced search
        nodes.forEach(node => {
            forEachNodeAndInnerNodes(node, (target) =>
                setNodeStateForMode(target, mode, isActive, stateChanges)
            );
        });
    };

    groupsPayload.forEach(({ type, targets, is_active }) => {
        if (!Array.isArray(targets) || !targets.length) return;
        if (type === "Group" || type === "Title") {
            targets.forEach(target => updateGroup(target, is_active));
        }
    });

    try {
        graph.setDirtyCanvas?.(true, true);
    } catch (_) {}
};

const sanitizeLegacyValues = function () {
    if (!this) return;
    let dirty = false;
    const normalize = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const restrictionWidget = getWidget(this, "toggle_restriction");
    if (restrictionWidget) {
        const val = normalize(restrictionWidget.value).trim();
        if (!VALID_TOGGLE_RESTRICTIONS.includes(val)) {
            restrictionWidget.value = VALID_TOGGLE_RESTRICTIONS[0];
            dirty = true;
        }
    }
    if (dirty) this.setDirtyCanvas?.(true, true);
};

const enforceRestriction = (node, slot, value) => {
    const restriction = getWidget(node, "toggle_restriction")?.value || "default";
    if (!value && restriction !== "always one") return true;
    const slotCount = clampInt(getWidget(node, "slot_count")?.value || 3);
    if (restriction === "max one" || restriction === "always one") {
        if (value) {
            node._DG_batchToggle = true;
            for (let other = 1; other <= slotCount; other++) {
                if (other === slot) continue;
                const otherWidget = getWidget(node, `switch_${other}`);
                if (otherWidget && otherWidget.value) {
                    otherWidget.value = false;
                    otherWidget.callback?.call(otherWidget, false);
                }
            }
            node._DG_batchToggle = false;
        } else if (restriction === "always one") {
            const anyOn = Array.from({ length: slotCount }, (_, i) => getWidget(node, `switch_${i + 1}`)?.value)
                .some(Boolean);
            if (!anyOn) {
                const widget = getWidget(node, `switch_${slot}`);
                if (widget) widget.value = true;
                return false;
            }
        }
    }
    return true;
};

const saveWidgetValueToProperties = (node, widget) => {
    if (!node || !widget || !widget.name) return;
    node.properties = node.properties || {};
    node.properties[widget.name] = widget.value;
};

// ---- Set all slots to given value ----
const setAllSlots = (node, value) => {
    if (!node) return;
    const slotCount = clampInt(getWidget(node, "slot_count")?.value || 3);
    node._DG_batchToggle = true;
    for (let slot = 1; slot <= slotCount; slot++) {
        const sw = getWidget(node, `switch_${slot}`);
        if (sw) {
            sw.value = value;
            saveWidgetValueToProperties(node, sw);
            if (sw.callback) sw.callback(value);
        }
    }
    node._DG_batchToggle = false;
    node.__DG_executeInstant?.();
    node.__DG_refreshWidgets?.();
};
const attachSwitchHandlers = (node) => {
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const widget = getWidget(node, `switch_${slot}`);
        if (!widget) continue;
        const original = widget.callback;
        widget.callback = function (value) {
            if (original) original.call(widget, value);
            saveWidgetValueToProperties(node, widget);
            if (!enforceRestriction(node, slot, value)) return;
            if (node._DG_batchToggle || node._DG_syncingToggles) return;
            node.__DG_executeInstant?.();
        };
    }
};

const attachInputHandlers = (node) => {
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const labelWidget = getWidget(node, `label_${slot}`);
        if (labelWidget) {
            const original = labelWidget.callback;
            labelWidget.callback = function (value) {
                if (original) original.call(labelWidget, value);
                saveWidgetValueToProperties(node, labelWidget);
                node.__DG_refreshWidgets?.();
            };
        }
        const targetWidget = getWidget(node, `targets_${slot}`);
        if (targetWidget) {
            const original = targetWidget.callback;
            targetWidget.callback = function (value) {
                if (original) original.call(targetWidget, value);
                saveWidgetValueToProperties(node, targetWidget);
                node.__DG_executeInstant?.();
            };
        }
    }
};

const refreshWidgets = function () {
    if (!this.widgets && !this.__DG_allWidgets) return;
    if (this.properties) {
        getAllTrackedWidgets(this).forEach((widget) => {
            if (widget.name && this.properties[widget.name] !== undefined) {
                const saved = this.properties[widget.name];
                if (widget.value !== saved) {
                    widget.value = saved;
                }
            }
        });
    }
    getAllTrackedWidgets(this).forEach(ensureHiddenAwareWidget);
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const isCompact = !!this.properties?._DG_compactMode;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const showFullInputs = !isCompact;
    const showSelectedSlotsCompact = isCompact;
    const offIcon = OFF_LABELS[mode] || OFF_LABELS.Bypass;
    const onIcon = ON_LABELS[mode] || "Active 🟢";

   // ---- Hide original AllSwitch ----
    const allSwitchOrig = getWidget(this, "AllSwitch");
    if (allSwitchOrig) allSwitchOrig.hidden = true;

    // ---- Visibility of None/All buttons ----
    const restriction = getWidget(this, "toggle_restriction")?.value || "default";
    const showAllSwitch = getWidget(this, "show_AllSwitch")?.value || false;
    const noneBtn = this.__DG_noneBtn;
    const allBtn = this.__DG_allBtn;
    if (noneBtn && allBtn) {
        // Show if restriction == "default" and slotCount > 1,
        // and (full mode OR (compact mode AND showAllSwitch == true))
        const showButtons = (restriction === "default") && (slotCount > 1) &&
                            (!isCompact || showAllSwitch);
        noneBtn.hidden = !showButtons;
        allBtn.hidden = !showButtons;
    }

    // ---- Visibility of show_AllSwitch itself (only in full mode) ----
    const showAllSwitchWidget = getWidget(this, "show_AllSwitch");
    if (showAllSwitchWidget) {
        // Visible only in full mode and restriction == "default" and slotCount > 1
        const show = !isCompact && (restriction === "default") && (slotCount > 1);
        applyWidgetHiddenState(showAllSwitchWidget, !show);
    }

    // ---- Slots visibility ----
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        const labelWidget = getWidget(this, `label_${slot}`);
        const targetWidget = getWidget(this, `targets_${slot}`);
        const labelValue = typeof labelWidget?.value === "string" ? labelWidget.value.trim() : "";
        const slotDisplayName = labelValue || `Slot ${slot}`;

        const withinRange = slot <= slotCount;
        const slotHasTargets = splitList(targetWidget?.value).length > 0;
        const hasConnectedLabelInput = hasNamedConnectedConvertedInput(this, `label_${slot}`);
        const hasConnectedTargetsInput = hasNamedConnectedConvertedInput(this, `targets_${slot}`);
        const showSlotDetails = withinRange && showFullInputs;

        if (switchWidget) {
            const hideForCompactSelection = showSelectedSlotsCompact && !slotHasTargets;
            applyWidgetHiddenState(switchWidget, !withinRange || hideForCompactSelection);
            switchWidget.options = switchWidget.options || {};
            switchWidget.options.on = onIcon;
            switchWidget.options.off = offIcon;
            switchWidget.options.label_on = onIcon;
            switchWidget.options.label_off = offIcon;
            switchWidget.label_on = onIcon;
            switchWidget.label_off = offIcon;
            switchWidget.label = slotDisplayName;
        }
        if (labelWidget) applyWidgetHiddenState(labelWidget, !showSlotDetails && !hasConnectedLabelInput);
        if (targetWidget) applyWidgetHiddenState(targetWidget, !showSlotDetails && !hasConnectedTargetsInput);
    }

    // ---- Hide mode, slot_count, toggle_restriction in compact ----
    const hideWhenCompact = isCompact;
    ["mode", "slot_count", "toggle_restriction"].forEach((name) => {
        const widget = getWidget(this, name);
        if (widget) applyWidgetHiddenState(widget, hideWhenCompact);
    });

    // ---- Single slot: hide buttons and show_AllSwitch ----
    if (slotCount <= 1) {
        if (noneBtn) noneBtn.hidden = true;
        if (allBtn) allBtn.hidden = true;
        if (showAllSwitchWidget) showAllSwitchWidget.hidden = true;
    }

    this.setDirtyCanvas?.(true, true);
    this.__DG_syncWidgetVisibility?.();
    syncWidgetBackedInputVisibility(this);
    this.__DG_updateAutoHeight?.();
    scheduleAutoHeightUpdate(this);
};

const scheduleAutoHeightUpdate = (node, attempts = 3, delay = 0) => {
    if (!node) return;
    if (node.__DG_autoHeightTimer) clearTimeout(node.__DG_autoHeightTimer);
    node.__DG_autoHeightTimer = setTimeout(() => {
        node.__DG_autoHeightTimer = null;
        node.__DG_updateAutoHeight?.();
        if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
    }, delay);
};

const scheduleCompactLayoutStabilization = (node, attempts = 2, delay = 0) => {
    if (!node) return;
    if (node.__DG_compactLayoutTimer) clearTimeout(node.__DG_compactLayoutTimer);
    node.__DG_compactLayoutTimer = setTimeout(() => {
        node.__DG_compactLayoutTimer = null;
        node.__DG_refreshWidgets?.();
        node.__DG_updateAutoHeight?.();
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
        if (attempts > 1) scheduleCompactLayoutStabilization(node, attempts - 1, 50);
    }, delay);
};

const syncTogglesWithGraph = function () {
    if ((!this.widgets && !this.__DG_allWidgets) || this.configuring) return;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    let dirty = false;
    this._DG_syncingToggles = true;

    const graph = app.graph;
    if (!graph) { this._DG_syncingToggles = false; return; }
    const groups = graph.groups || [];

    for (let slot = 1; slot <= slotCount; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        if (!switchWidget || switchWidget.hidden) continue;
        const rawTargets = splitList(getWidget(this, `targets_${slot}`)?.value);
        if (!rawTargets.length) continue;

        let allActive = true;
        let anyNode = false;
        rawTargets.forEach(groupName => {
            const nodes = getNodesInGroup(graph, groupName);
            if (!nodes.length) return;
            anyNode = true;
            nodes.forEach(node => {
                if (isNodeDisabled(node, mode)) allActive = false;
            });
        });

        if (!anyNode) continue;
        const shouldBeActive = allActive;
        if (switchWidget.value !== shouldBeActive) {
            switchWidget.value = shouldBeActive;
            saveWidgetValueToProperties(this, switchWidget);
            dirty = true;
        }
    }

    if (dirty) this.setDirtyCanvas?.(true, true);
    this._DG_syncingToggles = false;
};

const executeInstant = function () {
    if ((!this.widgets && !this.__DG_allWidgets) || this.configuring) return;
    this.__DG_refreshWidgets?.();
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const groupsPayload = [];
    const stateChanges = mode === "Mute" ? ["mute", "bypass"] : ["bypass", "mute"];

    const activeGroups = new Set();
    const inactiveGroups = new Set();

    for (let slot = 1; slot <= slotCount; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        if (!switchWidget || switchWidget.hidden) continue;
        const targets = splitList(getWidget(this, `targets_${slot}`)?.value);
        if (!targets.length) continue;
        const isActive = switchWidget.value;
        targets.forEach(target => {
            if (isActive) {
                activeGroups.add(target);
                inactiveGroups.delete(target);
            } else if (!activeGroups.has(target)) {
                inactiveGroups.add(target);
            }
        });
    }

    const filteredActive = Array.from(activeGroups);
    const filteredInactive = Array.from(inactiveGroups).filter(g => !activeGroups.has(g));

    if (filteredActive.length) groupsPayload.push({ type: "Group", targets: filteredActive, is_active: true });
    if (filteredInactive.length) groupsPayload.push({ type: "Group", targets: filteredInactive, is_active: false });

    // console.log("[DA_GroupController] groupsPayload:", groupsPayload);
    if (!groupsPayload.length) return;
    applyUniversalUpdate(mode, groupsPayload, stateChanges);
    this._DG_lastInstantExecution = Date.now();
};

const decorateNode = (node, nodeData) => {
    const type = nodeData?.name || node?.type || node?.comfyClass;
    if (type !== "DA_GroupController") return;

    node.__DG_isUniversalNode = true;
    node.__DG_isGroupNode = true;
    ensureWidgetTracking(node);

    // Make setAllSlots available on the node
    node.__DG_setAllSlots = setAllSlots;
    const onGraphChange = () => {
        if (!node.__DG_syncDisabled) {
            node.syncTogglesWithGraph?.();
        }
    };
    node.__DG_graphChangeHandler = onGraphChange;

    node.__DG_updateAutoHeight = () => {
        const currentWidth = node.size?.[0] ?? 200;
        const computeTarget = [currentWidth, 0];
        let computed = null;
        if (typeof node.computeSize === "function") {
            const originalWidgets = node.widgets;
            if (Array.isArray(originalWidgets) && originalWidgets.length) {
                const visibleWidgets = originalWidgets.filter((w) => !w?.hidden);
                if (visibleWidgets.length !== originalWidgets.length) {
                    node.widgets = visibleWidgets;
                    try {
                        computed = node.computeSize(computeTarget);
                    } finally {
                        node.widgets = originalWidgets;
                    }
                } else {
                    computed = node.computeSize(computeTarget);
                }
            } else {
                computed = node.computeSize(computeTarget);
            }
        }
        const width = currentWidth;
        const heightFallback = node.size?.[1] ?? LiteGraph?.NODE_TITLE_HEIGHT ?? 60;
        const height = Number.isFinite(computed?.[1]) ? computed[1] : heightFallback;
        if (!Number.isFinite(height)) return;
        if (typeof node.setSize === "function") {
            node.__DG_internalResize = true;
            node.setSize([width, height]);
            node.__DG_internalResize = false;
        } else {
            node.size = [width, height];
        }
    };

    node.__DG_sanitizeWidgets = sanitizeLegacyValues.bind(node);
    node.__DG_sanitizeWidgets?.();

    node.properties = node.properties || {};
    if (typeof node.properties._DG_compactMode !== "boolean") {
        node.properties._DG_compactMode = true;
    }

    // ---- Create None/All buttons (standard button widgets) ----
    setTimeout(() => {
        if (node.__DG_noneBtn && node.__DG_allBtn) return;

        const noneBtn = node.addWidget("button", "None", "none", () => {
            if (node.__DG_setAllSlots) {
                node.__DG_setAllSlots(node, false);
            } else {
                console.error("[DA_GroupController] setAllSlots not available");
            }
        });
        noneBtn.__DG_isActionButton = true;
        node.__DG_noneBtn = noneBtn;

        const allBtn = node.addWidget("button", "All", "all", () => {
            if (node.__DG_setAllSlots) {
                node.__DG_setAllSlots(node, true);
            } else {
                console.error("[DA_GroupController] setAllSlots not available");
            }
        });
        allBtn.__DG_isActionButton = true;
        node.__DG_allBtn = allBtn;

        node.__DG_refreshWidgets?.();
    }, 0);

    node.__DG_refreshWidgets = refreshWidgets.bind(node);
    node.syncTogglesWithGraph = syncTogglesWithGraph.bind(node);
    node.__DG_executeInstant = executeInstant.bind(node);
    node.__DG_toggleCompactMode = (nextState, { force = false } = {}) => {
        if (node.__DG_toggleInProgress) return;
        const activeElement = document.activeElement;
        const isWidgetInput =
            activeElement &&
            (activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.classList?.contains("litegraph") ||
                activeElement.id?.includes("widget"));
        const canvas = app.canvas;
        const interactingWidget = canvas?.interacting_widget || canvas?.active_widget;
        if (!force && (isWidgetInput || interactingWidget)) return;

        node.__DG_toggleInProgress = true;
        try {
            const current = !!node.properties._DG_compactMode;
            const target = typeof nextState === "boolean" ? nextState : !current;
            if (current === target) return;
            node.properties._DG_compactMode = target;
            node.__DG_refreshWidgets?.();
            node.__DG_updateAutoHeight?.();
            scheduleAutoHeightUpdate(node);
            scheduleCompactLayoutStabilization(node, 2, 0);
            node.setDirtyCanvas?.(true, true);
        } finally {
            setTimeout(() => { node.__DG_toggleInProgress = false; }, 50);
        }
    };

    const originalOnResize = node.onResize;
    node.onResize = function (...args) {
        if (!this.__DG_internalResize) this.__DG_manualResize = true;
        return originalOnResize?.apply(this, args);
    };

    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        if (this.__DG_autoHeightTimer) clearTimeout(this.__DG_autoHeightTimer);
        if (this.__DG_compactLayoutTimer) clearTimeout(this.__DG_compactLayoutTimer);
        try {
            if (this.__DG_graphChangeHandler && this.graph && typeof this.graph.off === "function") {
                this.graph.off('change', this.__DG_graphChangeHandler);
            }
        } catch (e) {
            console.warn("[DA_GroupController] Failed to unbind graph event:", e);
        }
        this.__DG_graphChangeHandler = null;
        return originalOnRemoved?.apply(this, args);
    };

    attachSwitchHandlers(node);
    attachInputHandlers(node);

    ["slot_count", "toggle_restriction", "mode", "show_AllSwitch"].forEach((name) => {
        const widget = getWidget(node, name);
        if (!widget) return;
        const original = widget.callback;
        widget.callback = function (value) {
            if (original) original.call(widget, value);
            saveWidgetValueToProperties(node, widget);
            node.__DG_refreshWidgets?.();
            if (name === "slot_count" || name === "mode") node.__DG_executeInstant?.();
        };
    });

    setTimeout(() => node.__DG_refreshWidgets?.(), 250);
};

const extendNodePrototype = (nodeType, nodeData) => {
    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        originalOnNodeCreated?.apply(this, arguments);
        decorateNode(this, nodeData);
    };

    const originalOnAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function () {
        originalOnAdded?.apply(this, arguments);
        this.__DG_sanitizeWidgets?.();
        if (this.graph && !this.__DG_graphChangeHandler) {
            const onGraphChange = () => {
                if (!this.__DG_syncDisabled) {
                    this.syncTogglesWithGraph?.();
                }
            };
            this.__DG_graphChangeHandler = onGraphChange;
            this.graph.on('change', onGraphChange);
        }
    };

    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
        originalOnConfigure?.apply(this, arguments);
        this.__DG_sanitizeWidgets?.();
        if (this.properties) {
            getAllTrackedWidgets(this).forEach((widget) => {
                if (widget.name && this.properties[widget.name] !== undefined) {
                    const saved = this.properties[widget.name];
                    if (widget.value !== saved) widget.value = saved;
                }
            });
        }
        setTimeout(() => this.__DG_refreshWidgets?.(), 0);
    };

    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (graphcanvas, options) {
        originalMenu?.apply(this, arguments);
        const compact = !!this.properties?._DG_compactMode;
        options.push({
            content: compact ? "🚦DA_GroupController: Full mode" : "🚦DA_GroupController: Compact mode",
            callback: () => this.__DG_toggleCompactMode?.(!compact, { force: true }),
        });
    };
};

app.registerExtension({
    name: "DA_GroupController",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData || nodeData.name !== "DA_GroupController") return;
        extendNodePrototype(nodeType, nodeData);
    },
});