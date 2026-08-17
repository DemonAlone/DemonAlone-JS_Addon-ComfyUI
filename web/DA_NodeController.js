//based on AUN_universal_instant.js from https://github.com/loz2754/AUN-ComfyUI-Nodes , MIT.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

console.log("[DA_NodeController] Extension loaded");

const MAX_SLOTS = 20;
const LIST_SPLITTER = /[,;]+/; // only comma and semicolon
const NODE_MODE_VALUES = {
    ALWAYS: globalThis.LiteGraph?.ALWAYS ?? 0,
    NEVER: globalThis.LiteGraph?.NEVER ?? 2,
    BYPASS: 4,
};
const VALID_TOGGLE_RESTRICTIONS = ["default", "max one", "always one"];
const VALID_TARGET_TYPES = ["ID", "Title"];

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
    return node.__DA_widgetLookup?.get(name) || null;
};

const applyWidgetHiddenState = (widget, hidden) => {
    if (!widget) return;
    widget.hidden = hidden;
    widget.__DA_visible = !hidden;
};

const trackWidgetMetadata = (node, widget) => {
    if (!node || !widget) return widget;
    node.__DA_widgetLookup = node.__DA_widgetLookup || new Map();
    node.__DA_allWidgets = node.__DA_allWidgets || [];
    node.__DA_widgetOrderCounter = node.__DA_widgetOrderCounter ?? 0;
    if (widget.name) node.__DA_widgetLookup.set(widget.name, widget);
    if (!node.__DA_allWidgets.includes(widget)) {
        if (!Number.isFinite(widget.__DA_order)) {
            widget.__DA_order = node.__DA_widgetOrderCounter++;
        }
        widget.__DA_visible = widget.__DA_visible !== false;
        node.__DA_allWidgets.push(widget);
    }
    return widget;
};

const syncWidgetVisibility = (node) => {
    if (!node?.__DA_allWidgets) return;
    const sorted = node.__DA_allWidgets
        .filter((w) => w && !w.__DA_removed)
        .sort((a, b) => (a.__DA_order ?? 0) - (b.__DA_order ?? 0));
    node.widgets = sorted;
};

const ensureWidgetTracking = (node) => {
    if (!node || node.__DA_widgetTrackingSetup) return;
    node.__DA_widgetTrackingSetup = true;
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
    node.__DA_syncWidgetVisibility = () => syncWidgetVisibility(node);
};

const getAllTrackedWidgets = (node) => node?.__DA_allWidgets || node?.widgets || [];

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
        // --- Added: make input optional ---
		input.optional = true;
        if (hidden) {
            input.required = false;
            if (input.__DA_savedType == null) {
                input.__DA_savedType = input.type;
            }
            if (input.link == null) {
                input.type = "__DA_HIDDEN__";
            }
        } else {
            // If not hidden, can also be left optional (in case the connection is not accepted)
			input.required = false;
            if (input.__DA_savedType != null) {
                input.type = input.__DA_savedType;
            }
        }
    });
};

const ensureHiddenAwareWidget = (widget) => {
    if (!widget || widget.__DA_hiddenAware) return;
    const originalCompute = typeof widget.computeSize === "function" ? widget.computeSize : null;
    widget.__DA_hiddenAware = true;
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

const evaluateNodeTargets = (predicate, mode) => {
    const graphs = getAllGraphs(app.graph);
    let total = 0;
    let disabled = 0;
    graphs.forEach((graph) => {
        const nodes = getGraphNodes(graph);
        nodes.forEach((node) => {
            if (!predicate(node)) return;
            total++;
            if (isNodeDisabled(node, mode)) disabled++;
        });
    });
    return { total, disabled };
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
    const graphs = getAllGraphs(app.graph);
    const allNodes = [];
    const nodesById = new Map();
    graphs.forEach((graph) => {
        const nodes = getGraphNodes(graph);
        nodes.forEach((node) => {
            allNodes.push(node);
            nodesById.set(String(node.id), node);
        });
    });

    const updateById = (id, isActive) => {
        const normalized = String(id ?? "").trim();
        if (!normalized) return;
        const node = nodesById.get(normalized) || nodesById.get(String(Number(normalized)));
        if (!node) return;
        forEachNodeAndInnerNodes(node, (target) =>
            setNodeStateForMode(target, mode, isActive, stateChanges)
        );
    };

    const updateByTitle = (targets, isActive) => {
        const needles = targets.map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean);
        if (!needles.length) return;
        allNodes.forEach((node) => {
            const title = String(node.title || "").toLowerCase();
            if (!needles.some((needle) => title.includes(needle))) return;
            forEachNodeAndInnerNodes(node, (target) =>
                setNodeStateForMode(target, mode, isActive, stateChanges)
            );
        });
    };

    groupsPayload.forEach(({ type, targets, is_active }) => {
        if (!Array.isArray(targets) || !targets.length) return;
        if (type === "ID") {
            targets.forEach((target) => updateById(target, is_active));
        } else if (type === "Title") {
            updateByTitle(targets, is_active);
        }
    });

    try {
        graphs.forEach((g) => g?.setDirtyCanvas?.(true, true));
        app?.graph?.setDirtyCanvas?.(true, true);
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
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const typeWidget = getWidget(this, `target_type_${slot}`);
        if (!typeWidget) continue;
        const val = normalize(typeWidget.value).trim();
        if (!VALID_TARGET_TYPES.includes(val)) {
            typeWidget.value = VALID_TARGET_TYPES[0];
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
            node._DA_batchToggle = true;
            for (let other = 1; other <= slotCount; other++) {
                if (other === slot) continue;
                const otherWidget = getWidget(node, `switch_${other}`);
                if (otherWidget && otherWidget.value) {
                    otherWidget.value = false;
                    otherWidget.callback?.call(otherWidget, false);
                }
            }
            node._DA_batchToggle = false;
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

const attachSwitchHandlers = (node) => {
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const widget = getWidget(node, `switch_${slot}`);
        if (!widget) continue;
        const original = widget.callback;
        widget.callback = function (value) {
            if (original) original.call(widget, value);
            saveWidgetValueToProperties(node, widget);
            if (!enforceRestriction(node, slot, value)) return;
            if (node._DA_batchToggle || node._DA_syncingToggles) return;
            if (!value) {
                const allSwitch = getWidget(node, "AllSwitch");
                if (allSwitch && allSwitch.value) {
                    allSwitch.value = false;
                    saveWidgetValueToProperties(node, allSwitch);
                }
            }
            node.__DA_executeInstant?.();
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
                node.__DA_refreshWidgets?.();
            };
        }
        const targetWidget = getWidget(node, `targets_${slot}`);
        if (targetWidget) {
            const original = targetWidget.callback;
            targetWidget.callback = function (value) {
                if (original) original.call(targetWidget, value);
                saveWidgetValueToProperties(node, targetWidget);
                node.__DA_executeInstant?.();
            };
        }
        const typeWidget = getWidget(node, `target_type_${slot}`);
        if (typeWidget) {
            const original = typeWidget.callback;
            typeWidget.callback = function (value) {
                if (original) original.call(typeWidget, value);
                saveWidgetValueToProperties(node, typeWidget);
                node.__DA_refreshWidgets?.();
            };
        }
    }
};

const attachAllSwitchHandler = (node) => {
    const widget = getWidget(node, "AllSwitch");
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function (value) {
        if (original) original.call(widget, value);
        saveWidgetValueToProperties(node, widget);
        node._DA_batchToggle = true;
        const total = clampInt(getWidget(node, "slot_count")?.value || 3);
        for (let slot = 1; slot <= total; slot++) {
            const sw = getWidget(node, `switch_${slot}`);
            if (sw && sw.value !== value) {
                sw.value = value;
                saveWidgetValueToProperties(node, sw);
                sw.callback?.call(sw, value);
            }
        }
        node._DA_batchToggle = false;
        node.__DA_executeInstant?.();
    };
};

const refreshWidgets = function () {
    if (!this.widgets && !this.__DA_allWidgets) return;
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
    const isCompact = !!this.properties?._DA_compactMode;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const showFullInputs = !isCompact;
    const showSelectedSlotsCompact = isCompact;
    const offIcon = OFF_LABELS[mode] || OFF_LABELS.Bypass;
    const onIcon = ON_LABELS[mode] || "Active 🟢";

    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        const labelWidget = getWidget(this, `label_${slot}`);
        const targetWidget = getWidget(this, `targets_${slot}`);
        const typeWidget = getWidget(this, `target_type_${slot}`);
        const labelValue = typeof labelWidget?.value === "string" ? labelWidget.value.trim() : "";
        const slotDisplayName = labelValue || `Slot ${slot}`;

        const withinRange = slot <= slotCount;
        const slotSelected = !!switchWidget?.value;
        const slotHasTargets = splitList(targetWidget?.value).length > 0;
        const slotActive = slotSelected && slotHasTargets;
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
        if (typeWidget) applyWidgetHiddenState(typeWidget, !showSlotDetails);
    }

    const hideWhenCompact = isCompact;
    ["mode", "slot_count", "toggle_restriction", "show_AllSwitch"].forEach((name) => {
        const widget = getWidget(this, name);
        if (widget) applyWidgetHiddenState(widget, hideWhenCompact);
    });

    const singleSlot = slotCount <= 1;
    const allSwitch = getWidget(this, "AllSwitch");
    if (allSwitch) {
        const hideForCompactSingle = isCompact && !getWidget(this, "show_AllSwitch")?.value;
        const shouldHide = hideForCompactSingle || singleSlot;
        applyWidgetHiddenState(allSwitch, shouldHide);
        if (shouldHide && allSwitch.value) {
            allSwitch.value = false;
            saveWidgetValueToProperties(this, allSwitch);
            this.setDirtyCanvas?.(true, true);
        }
    }

    this.setDirtyCanvas?.(true, true);
    this.__DA_syncWidgetVisibility?.();
    syncWidgetBackedInputVisibility(this);
    this.__DA_updateAutoHeight?.();
    scheduleAutoHeightUpdate(this);
};

const scheduleAutoHeightUpdate = (node, attempts = 3, delay = 0) => {
    if (!node) return;
    if (node.__DA_autoHeightTimer) clearTimeout(node.__DA_autoHeightTimer);
    node.__DA_autoHeightTimer = setTimeout(() => {
        node.__DA_autoHeightTimer = null;
        node.__DA_updateAutoHeight?.();
        if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
    }, delay);
};

const scheduleCompactLayoutStabilization = (node, attempts = 2, delay = 0) => {
    if (!node) return;
    if (node.__DA_compactLayoutTimer) clearTimeout(node.__DA_compactLayoutTimer);
    node.__DA_compactLayoutTimer = setTimeout(() => {
        node.__DA_compactLayoutTimer = null;
        node.__DA_refreshWidgets?.();
        node.__DA_updateAutoHeight?.();
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
        if (attempts > 1) scheduleCompactLayoutStabilization(node, attempts - 1, 50);
    }, delay);
};

const syncTogglesWithGraph = function () {
    if ((!this.widgets && !this.__DA_allWidgets) || this.configuring) return;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    let dirty = false;
    this._DA_syncingToggles = true;
    for (let slot = 1; slot <= slotCount; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        if (!switchWidget || switchWidget.hidden) continue;
        const targetType = getWidget(this, `target_type_${slot}`)?.value || "ID";
        const rawTargets = splitList(getWidget(this, `targets_${slot}`)?.value);
        if (!rawTargets.length) continue;
        const targetSet = new Set(rawTargets);
        const predicate = (node) => {
            if (targetType === "ID") return targetSet.has(String(node.id));
            const title = String(node.title || "").toLowerCase();
            return rawTargets.some((v) => title.includes(v));
        };
        const { total, disabled } = evaluateNodeTargets(predicate, mode);
        if (!total) continue;
        const shouldBeActive = disabled === 0;
        if (switchWidget.value !== shouldBeActive) {
            switchWidget.value = shouldBeActive;
            saveWidgetValueToProperties(this, switchWidget);
            dirty = true;
        }
    }
    if (dirty) this.setDirtyCanvas?.(true, true);
    this._DA_syncingToggles = false;
};

const executeInstant = function () {
    if ((!this.widgets && !this.__DA_allWidgets) || this.configuring) return;
    this.__DA_refreshWidgets?.();
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const allSwitch = !!getWidget(this, "AllSwitch")?.value;
    const groupsPayload = [];
    const stateChanges = mode === "Mute" ? ["mute", "bypass"] : ["bypass", "mute"];

    const activeIds = new Set();
    const inactiveIds = new Set();
    const activeTitles = new Set();
    const inactiveTitles = new Set();

    for (let slot = 1; slot <= slotCount; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        if (!switchWidget || switchWidget.hidden) continue;
        const targetType = getWidget(this, `target_type_${slot}`)?.value || "ID";
        const targets = splitList(getWidget(this, `targets_${slot}`)?.value);
        if (!targets.length) continue;
        const isActive = (switchWidget.value || allSwitch);
        targets.forEach((target) => {
            if (targetType === "ID") {
                if (isActive) {
                    activeIds.add(target);
                    inactiveIds.delete(target);
                } else if (!activeIds.has(target)) {
                    inactiveIds.add(target);
                }
            } else {
                if (isActive) {
                    activeTitles.add(target);
                    inactiveTitles.delete(target);
                } else if (!activeTitles.has(target)) {
                    inactiveTitles.add(target);
                }
            }
        });
    }

    const filteredActiveIds = Array.from(activeIds);
    const filteredInactiveIds = Array.from(inactiveIds).filter((id) => !activeIds.has(id));
    const filteredActiveTitles = Array.from(activeTitles);
    const filteredInactiveTitles = Array.from(inactiveTitles).filter((title) => !activeTitles.has(title));

    if (filteredActiveIds.length) groupsPayload.push({ type: "ID", targets: filteredActiveIds, is_active: true });
    if (filteredInactiveIds.length) groupsPayload.push({ type: "ID", targets: filteredInactiveIds, is_active: false });
    if (filteredActiveTitles.length) groupsPayload.push({ type: "Title", targets: filteredActiveTitles, is_active: true });
    if (filteredInactiveTitles.length) groupsPayload.push({ type: "Title", targets: filteredInactiveTitles, is_active: false });

    if (!groupsPayload.length) return;
    applyUniversalUpdate(mode, groupsPayload, stateChanges);
    this._DA_lastInstantExecution = Date.now();
};

const decorateNode = (node, nodeData) => {
    const type = nodeData?.name || node?.type || node?.comfyClass;
    if (type !== "DA_NodeController") return;

    node.__DA_isUniversalNode = true;
    node.__DA_isGroupNode = false;
    ensureWidgetTracking(node);
	
	const onGraphChange = () => {
        if (!node.__DA_syncDisabled) {
            node.syncTogglesWithGraph?.();
        }
    };
    node.__DA_graphChangeHandler = onGraphChange;

    node.__DA_updateAutoHeight = () => {
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
            node.__DA_internalResize = true;
            node.setSize([width, height]);
            node.__DA_internalResize = false;
        } else {
            node.size = [width, height];
        }
    };

    node.__DA_sanitizeWidgets = sanitizeLegacyValues.bind(node);
    node.__DA_sanitizeWidgets?.();

    node.properties = node.properties || {};
    if (typeof node.properties._DA_compactMode !== "boolean") {
        node.properties._DA_compactMode = true;
    }

    node.__DA_refreshWidgets = refreshWidgets.bind(node);
    node.syncTogglesWithGraph = syncTogglesWithGraph.bind(node);
    node.__DA_executeInstant = executeInstant.bind(node);
    node.__DA_toggleCompactMode = (nextState, { force = false } = {}) => {
        if (node.__DA_toggleInProgress) return;
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

        node.__DA_toggleInProgress = true;
        try {
            const current = !!node.properties._DA_compactMode;
            const target = typeof nextState === "boolean" ? nextState : !current;
            if (current === target) return;
            node.properties._DA_compactMode = target;
            node.__DA_refreshWidgets?.();
            node.__DA_updateAutoHeight?.();
            scheduleAutoHeightUpdate(node);
            scheduleCompactLayoutStabilization(node, 2, 0);
            node.setDirtyCanvas?.(true, true);
        } finally {
            setTimeout(() => { node.__DA_toggleInProgress = false; }, 50);
        }
    };

    const originalOnResize = node.onResize;
    node.onResize = function (...args) {
        if (!this.__DA_internalResize) this.__DA_manualResize = true;
        return originalOnResize?.apply(this, args);
    };

	const originalOnRemoved = node.onRemoved;
	node.onRemoved = function (...args) {
			if (this.__DA_autoHeightTimer) clearTimeout(this.__DA_autoHeightTimer);
			if (this.__DA_compactLayoutTimer) clearTimeout(this.__DA_compactLayoutTimer);

			// safe unsubscription from graph events
			try {
				if (this.__DA_graphChangeHandler && this.graph && typeof this.graph.off === "function") {
					this.graph.off('change', this.__DA_graphChangeHandler);
				}
			} catch (e) {
				console.warn("[DA_NodeController] Failed to unbind graph event:", e);
			}
			this.__DA_graphChangeHandler = null;
			return originalOnRemoved?.apply(this, args);
	};

    attachSwitchHandlers(node);
    attachInputHandlers(node);
    attachAllSwitchHandler(node);

    ["slot_count", "toggle_restriction", "mode", "show_AllSwitch"].forEach((name) => {
        const widget = getWidget(node, name);
        if (!widget) return;
        const original = widget.callback;
        widget.callback = function (value) {
            if (original) original.call(widget, value);
            saveWidgetValueToProperties(node, widget);
            node.__DA_refreshWidgets?.();
            if (name === "slot_count" || name === "mode") node.__DA_executeInstant?.();
        };
    });

    setTimeout(() => node.__DA_refreshWidgets?.(), 250);

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
		this.__DA_sanitizeWidgets?.();
		
		if (this.graph && !this.__DA_graphChangeHandler) {
			const onGraphChange = () => {
				if (!this.__DA_syncDisabled) {
					this.syncTogglesWithGraph?.();
				}
			};
			this.__DA_graphChangeHandler = onGraphChange;
			this.graph.on('change', onGraphChange);
		}
	};

    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
        originalOnConfigure?.apply(this, arguments);
        this.__DA_sanitizeWidgets?.();
        if (this.properties) {
            getAllTrackedWidgets(this).forEach((widget) => {
                if (widget.name && this.properties[widget.name] !== undefined) {
                    const saved = this.properties[widget.name];
                    if (widget.value !== saved) widget.value = saved;
                }
            });
        }
        setTimeout(() => this.__DA_refreshWidgets?.(), 0);
    };

    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (graphcanvas, options) {
        originalMenu?.apply(this, arguments);
        const compact = !!this.properties?._DA_compactMode;
        options.push({
            content: compact ? "DA_NodeController: Full mode" : "DA_NodeController: Compact mode",
            callback: () => this.__DA_toggleCompactMode?.(!compact, { force: true }),
        });
    };
};

app.registerExtension({
    name: "DA_NodeController",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData || nodeData.name !== "DA_NodeController") return;
        extendNodePrototype(nodeType, nodeData);
    },
});