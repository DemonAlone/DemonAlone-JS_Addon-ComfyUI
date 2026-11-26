import { app } from "../../scripts/app.js";

console.log("[DA_NodeController_v2]  loaded");

const MAX_SLOTS = 20;
const LIST_SPLITTER = /[,;]+/;
const NODE_MODES = {
	ALWAYS: globalThis.LiteGraph?.ALWAYS ?? 0,
	NEVER: globalThis.LiteGraph?.NEVER ?? 2,
	BYPASS: 4,
};

const VALID_MODES = ["Bypass", "Mute"];
const VALID_RESTRICTIONS = ["default", "max one", "always one"];
const VALID_TARGET_TYPES = ["ID", "Title"];

const OFF_LABELS = { Bypass: "Bypass 🔴", Mute: "Mute 🔇" };
const ON_LABELS = { Bypass: "Active 🟢", Mute: "Active 🟢" };

const clampInt = (val, min = 1, max = MAX_SLOTS) => {
	const num = Number(val);
	if (!Number.isFinite(num)) return min;
	return Math.min(max, Math.max(min, Math.round(num)));
};

const splitList = (value) => {
	if (!value || typeof value !== "string") return [];
	return value
		.split(LIST_SPLITTER)
		.map((s) => s.trim())
		.filter((s) => s && s !== "0");
};

// --- 1. Initialize and validate repositories in node.properties ---
const ensureConfig = (node) => {
	node.properties = node.properties || {};
	const p = node.properties;

	if (typeof p.compactMode !== "boolean") p.compactMode = false;
	if (!VALID_MODES.includes(p.mode)) p.mode = "Bypass";
	p.slotCount = clampInt(p.slotCount ?? 3, 1, MAX_SLOTS);
	if (!VALID_RESTRICTIONS.includes(p.toggleRestriction)) {
		p.toggleRestriction = "default";
	}
	if (typeof p.showAllSwitch !== "boolean") p.showAllSwitch = false;
	if (!Number.isFinite(p.savedWidth) || p.savedWidth < 220) {
		p.savedWidth = 300;
	}
	const defaultActive = p.toggleRestriction === "default";

	if (!Array.isArray(p.slots)) p.slots = [];
	for (let i = 0; i < MAX_SLOTS; i++) {
		const s = p.slots.at(i) || {};
		p.slots[i] = {
			label: typeof s.label === "string" ? s.label : "",
			targets: typeof s.targets === "string" ? s.targets : "0",
			active: typeof s.active === "boolean" ? s.active : defaultActive,
			targetType: VALID_TARGET_TYPES.includes(s.targetType)
				? s.targetType
				: "ID",
		};
	}
	return p;
};

// Forcefully read values ​​from active widgets (saves from Vue input bugs in Nodes 2.0)
const syncConfigToWidgets = (node) => {
	if (!node || !Array.isArray(node.widgets)) return;
	const cfg = ensureConfig(node);
	const offLabel = OFF_LABELS[cfg.mode] || OFF_LABELS.Bypass;
	const onLabel = ON_LABELS[cfg.mode] || "Active 🟢";

	for (const w of node.widgets) {
		if (!w) continue;
		if (w.name === "mode") w.value = cfg.mode;
		else if (w.name === "slot_count") w.value = cfg.slotCount;
		else if (w.name === "toggle_restriction") w.value = cfg.toggleRestriction;
		else if (w.name === "show_AllSwitch") w.value = cfg.showAllSwitch;
		else if (Number.isInteger(w.__DA_slotIndex)) {
			const slot = cfg.slots.at(w.__DA_slotIndex);
			if (slot) {
				w.value = Boolean(slot.active);
				w.label = slot.label.trim() || `Slot ${w.__DA_slotIndex + 1}`;
				if (w.options) {
					w.options.on = onLabel;
					w.options.off = offLabel;
				}
			}
		}
	}
	node.setDirtyCanvas?.(true, true);
};

// taking text fields from widgets into the config (in case Vue did not call the callback)
const flushInputsToConfig = (node) => {
	if (!node || !Array.isArray(node.widgets)) return;
	const cfg = ensureConfig(node);
	for (const w of node.widgets) {
		if (!w || !w.name) continue;
		if (w.name.startsWith("label_")) {
			const idx = Number(w.name.slice(6)) - 1;
			if (idx >= 0 && idx < MAX_SLOTS)
				cfg.slots[idx].label = String(w.value ?? "");
		} else if (w.name.startsWith("targets_")) {
			const idx = Number(w.name.slice(8)) - 1;
			if (idx >= 0 && idx < MAX_SLOTS)
				cfg.slots[idx].targets = String(w.value ?? "");
		} else if (w.name.startsWith("target_type_")) {
			const idx = Number(w.name.slice(12)) - 1;
			if (idx >= 0 && idx < MAX_SLOTS && VALID_TARGET_TYPES.includes(w.value)) {
				cfg.slots[idx].targetType = w.value;
			}
		}
	}
};
const getGraphNodes = (graph) => {
	if (!graph) return [];
	const raw = graph._nodes || graph.nodes;
	if (Array.isArray(raw)) return raw;
	if (raw instanceof Map || raw instanceof Set) return Array.from(raw.values());
	return [];
};

const getAllGraphs = (root) => {
	const seen = new Set();
	const result = [];
	const visit = (candidate) => {
		const graph =
			candidate?.graph && (candidate.graph._nodes || candidate.graph.nodes)
				? candidate.graph
				: candidate;
		if (!graph || seen.has(graph)) return;
		seen.add(graph);
		result.push(graph);

		const collections = [graph.graphs, graph.subgraphs, graph._subgraphs];
		for (const col of collections) {
			if (!col) continue;
			if (Array.isArray(col)) col.forEach(visit);
			else if (col instanceof Map || col instanceof Set) col.forEach(visit);
			else if (typeof col === "object") Object.values(col).forEach(visit);
		}

		for (const node of getGraphNodes(graph)) {
			const inner = [
				node?.getInnerGraph?.(),
				node?.subgraph,
				node?.inner_graph,
				node?.innerGraph,
				node?._subgraph,
				node?.subgraphs,
			];
			for (const item of inner) {
				if (Array.isArray(item)) item.forEach(visit);
				else if (item) visit(item);
			}
		}
	};
	visit(root);
	return result;
};

const forEachNodeAndInner = (node, visitor, visited = new Set()) => {
	if (!node || visited.has(node)) return;
	visited.add(node);
	visitor(node);

	const inner = [
		node?.getInnerGraph?.(),
		node?.subgraph,
		node?.inner_graph,
		node?.innerGraph,
		node?._subgraph,
		node?.subgraphs,
	];
	for (const candidate of inner) {
		const graphs = Array.isArray(candidate) ? candidate : [candidate];
		for (const g of graphs) {
			const graph = g?.graph || g;
			if (graph && (graph._nodes || graph.nodes)) {
				for (const child of getGraphNodes(graph)) {
					forEachNodeAndInner(child, visitor, visited);
				}
			}
		}
	}
};

// --- 3. Applying states to target nodes ---
const buildStatePayload = (node) => {
	const cfg = ensureConfig(node);
	return JSON.stringify({
		compactMode: cfg.compactMode,
		mode: cfg.mode,
		slotCount: cfg.slotCount,
		toggleRestriction: cfg.toggleRestriction,
		showAllSwitch: cfg.showAllSwitch,
		savedWidth: cfg.savedWidth,
		extraHeight: cfg.extraHeight || 0,
		slots: cfg.slots,
	});
};

const syncStorage = (node) => {
	if (!node) return;
	node.properties = node.properties || {};
	node.properties.__DA_json = buildStatePayload(node);
};

const restoreStorage = (node, rawJson = null) => {
	const source = rawJson || node?.properties?.__DA_json;
	if (!source) return false;
	try {
		const parsed = typeof source === "string" ? JSON.parse(source) : source;
		if (parsed && typeof parsed === "object") {
			node.properties = node.properties || {};
			Object.assign(node.properties, parsed);
			node.properties.__DA_json =
				typeof source === "string" ? source : JSON.stringify(source);
			return true;
		}
	} catch (_) {}
	return false;
};
const applyStateToGraph = (node) => {
	flushInputsToConfig(node);
	syncStorage(node);
	const cfg = ensureConfig(node);
	const activeIds = new Set();
	const inactiveIds = new Set();
	const activeTitles = new Set();
	const inactiveTitles = new Set();

	for (let i = 0; i < cfg.slotCount; i++) {
		const slot = cfg.slots.at(i);
		const targets = splitList(slot.targets);
		if (!targets.length) continue;

		for (const rawTarget of targets) {
			if (slot.targetType === "ID") {
				if (slot.active) {
					activeIds.add(rawTarget);
					inactiveIds.delete(rawTarget);
				} else if (!activeIds.has(rawTarget)) {
					inactiveIds.add(rawTarget);
				}
			} else {
				const lower = rawTarget.toLowerCase();
				if (slot.active) {
					activeTitles.add(lower);
					inactiveTitles.delete(lower);
				} else if (!activeTitles.has(lower)) {
					inactiveTitles.add(lower);
				}
			}
		}
	}

	if (
		!activeIds.size &&
		!inactiveIds.size &&
		!activeTitles.size &&
		!inactiveTitles.size
	) {
		return;
	}

	const disabledMode =
		cfg.mode === "Mute" ? NODE_MODES.NEVER : NODE_MODES.BYPASS;
	const graphs = getAllGraphs(app.graph);

	node.__DA_applying = true;
	try {
		const setTargetMode = (targetNode, isActive) => {
			const desired = isActive ? NODE_MODES.ALWAYS : disabledMode;
			if (targetNode.mode !== desired) {
				targetNode.mode = desired;
				targetNode.setDirtyCanvas?.(true, true);
			}
		};

		for (const graph of graphs) {
			for (const n of getGraphNodes(graph)) {
				const idStr = String(n.id);
				const titleLower = String(n.title || "").toLowerCase();

				let matchedState = null;
				if (activeIds.has(idStr)) matchedState = true;
				else if (inactiveIds.has(idStr)) matchedState = false;
				else if (
					Array.from(activeTitles).some((needle) => titleLower.includes(needle))
				) {
					matchedState = true;
				} else if (
					Array.from(inactiveTitles).some((needle) =>
						titleLower.includes(needle),
					)
				) {
					matchedState = false;
				}

				if (matchedState !== null) {
					forEachNodeAndInner(n, (target) =>
						setTargetMode(target, matchedState),
					);
				}
			}
		}
		app.graph?.change?.();
		app.graph?.setDirtyCanvas?.(true, true);
	} finally {
		node.__DA_applying = false;
	}
};

// --- 4. Reverse synchronization: if the nodes in the graph were switched manually ---
const syncFromGraph = (node) => {
	if (!node || node.__DA_applying || node.configuring) return;
	const cfg = ensureConfig(node);
	const disabledMode =
		cfg.mode === "Mute" ? NODE_MODES.NEVER : NODE_MODES.BYPASS;
	const graphs = getAllGraphs(app.graph);
	const allNodes = graphs.flatMap(getGraphNodes);

	let changed = false;
	for (let i = 0; i < cfg.slotCount; i++) {
		const slot = cfg.slots.at(i);
		const targets = splitList(slot.targets);
		if (!targets.length) continue;

		let total = 0;
		let disabled = 0;

		for (const n of allNodes) {
			const match =
				slot.targetType === "ID"
					? targets.includes(String(n.id))
					: targets.some((t) =>
							String(n.title || "")
								.toLowerCase()
								.includes(t.toLowerCase()),
						);
			if (match) {
				total++;
				if (n.mode === disabledMode) disabled++;
			}
		}

		if (total > 0) {
			const shouldBeActive = disabled === 0;
			if (slot.active !== shouldBeActive) {
				slot.active = shouldBeActive;
				changed = true;
			}
		}
	}

	if (changed) {
		syncStorage(node);
		syncConfigToWidgets(node);
	}
};

// --- 5. Switch restrictions (max one / always one) ---
const applyRestrictionRules = (cfg, changedIndex, nextValue) => {
	const restriction = cfg.toggleRestriction;

	if (!nextValue && restriction === "always one") {
		const anyOtherOn = cfg.slots
			.slice(0, cfg.slotCount)
			.some((s, idx) => idx !== changedIndex && s.active);
		if (!anyOtherOn) {
			cfg.slots[changedIndex].active = true;
			return;
		}
	}

	cfg.slots[changedIndex].active = Boolean(nextValue);

	if (
		nextValue &&
		(restriction === "max one" || restriction === "always one")
	) {
		for (let i = 0; i < cfg.slotCount; i++) {
			if (i !== changedIndex) cfg.slots[i].active = false;
		}
	}
};

const handleSlotToggle = (node, slotIndex, nextValue) => {
	const cfg = ensureConfig(node);
	applyRestrictionRules(cfg, slotIndex, nextValue);
	syncStorage(node);
	syncConfigToWidgets(node);
	applyStateToGraph(node);
};

// --- 6. Dimensions and reassembly ---
const getBaseHeight = (node) => {
	const count = node?.widgets?.length ?? 1;
	return Math.max(54, count * 15 + 34);
};

const captureCurrentSize = (node) => {
	if (!node || node.__DA_internalResize || node.__DA_configuring) return;
	if (
		!node.size ||
		typeof node.size.length !== "number" ||
		node.size.length < 2
	)
		return;

	const rawW = Number(node.size.at(0));
	const rawH = Number(node.size.at(1));
	const cfg = ensureConfig(node);

	if (Number.isFinite(rawW) && rawW >= 220) {
		cfg.savedWidth = Math.round(rawW);
	}
	if (Number.isFinite(rawH)) {
		const baseH = getBaseHeight(node);
		cfg.extraHeight = Math.max(0, Math.round(rawH - baseH));
	}
};

const updateNodeDimensions = (node) => {
	if (!node) return;
	const cfg = ensureConfig(node);
	const width = Math.max(220, cfg.savedWidth || 240);
	const height = getBaseHeight(node) + Math.max(0, cfg.extraHeight || 0);

	node.__DA_internalResize = true;
	try {
		if (typeof node.setSize === "function") {
			node.setSize([width, height]);
		} else if (node.size && typeof node.size.set === "function") {
			node.size.set([width, height]);
		} else {
			node.size = [width, height];
		}
	} finally {
		node.__DA_internalResize = false;
	}
};

const rebuildWidgets = (node) => {
	if (!node) return;
	captureCurrentSize(node);
	restoreStorage(node);
	const cfg = ensureConfig(node);
	const isCompact = cfg.compactMode;
	const offLabel = OFF_LABELS[cfg.mode] || OFF_LABELS.Bypass;
	const onLabel = ON_LABELS[cfg.mode] || "Active 🟢";

// If in always one mode no slot is active, turn on the first one
	if (cfg.toggleRestriction === "always one") {
		const anyOn = cfg.slots.slice(0, cfg.slotCount).some((s) => s.active);
		if (!anyOn && cfg.slotCount > 0) cfg.slots.active = true;
	}
// Clear the array without losing the reference to the array object itself (important for Vue reactivity)
	if (Array.isArray(node.widgets)) {
		node.widgets.length = 0;
	} else {
		node.widgets = [];
	}
	if (!isCompact) {
		const modeW = node.addWidget(
			"combo",
			"mode",
			cfg.mode,
			(val) => {
				if (VALID_MODES.includes(val)) {
					cfg.mode = val;
					modeW.options.default = val;
					syncStorage(node);
					syncConfigToWidgets(node);
					applyStateToGraph(node);
				}
			},
			{ values: VALID_MODES, default: cfg.mode },
		);
		modeW.value = cfg.mode;

		const countW = node.addWidget(
			"number",
			"slot_count",
			cfg.slotCount,
			(val) => {
				flushInputsToConfig(node);
				cfg.slotCount = clampInt(val, 1, MAX_SLOTS);
				syncStorage(node);
				rebuildWidgets(node);
				applyStateToGraph(node);
			},
			{
				min: 1,
				max: MAX_SLOTS,
				step: 10,
				precision: 0,
				default: cfg.slotCount,
			},
		);
		countW.value = cfg.slotCount;

		const restW = node.addWidget(
			"combo",
			"toggle_restriction",
			cfg.toggleRestriction,
			(val) => {
				if (VALID_RESTRICTIONS.includes(val)) {
					flushInputsToConfig(node);
					cfg.toggleRestriction = val;
					if (val === "max one" || val === "always one") {
						const firstActive = cfg.slots
							.slice(0, cfg.slotCount)
							.findIndex((s) => s.active);
						for (let i = 0; i < cfg.slotCount; i++) {
							cfg.slots[i].active =
								i ===
								(firstActive >= 0
									? firstActive
									: val === "always one"
										? 0
										: -1);
						}
					}
					syncStorage(node);
					rebuildWidgets(node);
					applyStateToGraph(node);
				}
			},
			{ values: VALID_RESTRICTIONS, default: cfg.toggleRestriction },
		);
		restW.value = cfg.toggleRestriction;

		if (cfg.toggleRestriction === "default" && cfg.slotCount > 1) {
			const allSwW = node.addWidget(
				"toggle",
				"show_AllSwitch",
				cfg.showAllSwitch,
				(val) => {
					flushInputsToConfig(node);
					cfg.showAllSwitch = Boolean(val);
					syncStorage(node);
					rebuildWidgets(node);
				},
				{ default: cfg.showAllSwitch },
			);
			allSwW.value = cfg.showAllSwitch;
		}
	}

	// Buttons None / All
	const showBatchButtons =
		cfg.toggleRestriction === "default" &&
		cfg.slotCount > 1 &&
		(!isCompact || cfg.showAllSwitch);

	if (showBatchButtons) {
		node.addWidget("button", "None", null, () => {
			flushInputsToConfig(node);
			for (let i = 0; i < cfg.slotCount; i++) cfg.slots[i].active = false;
			syncStorage(node);
			syncConfigToWidgets(node);
			applyStateToGraph(node);
		});
		node.addWidget("button", "All", null, () => {
			flushInputsToConfig(node);
			for (let i = 0; i < cfg.slotCount; i++) cfg.slots[i].active = true;
			syncStorage(node);
			syncConfigToWidgets(node);
			applyStateToGraph(node);
		});
	}

	// Slots
	for (let i = 0; i < cfg.slotCount; i++) {
		const slot = cfg.slots.at(i);
		const hasTargets = splitList(slot.targets).length > 0;

		// In compact mode, show only configured slots
		if (isCompact && !hasTargets) continue;

		const displayName = slot.label.trim() || `Slot ${i + 1}`;
		const toggleWidget = node.addWidget(
			"toggle",
			`switch_${i + 1}`,
			slot.active,
			(val) => handleSlotToggle(node, i, val),
			{ on: onLabel, off: offLabel, default: slot.active },
		);
		toggleWidget.value = slot.active;
		toggleWidget.label = displayName;
		toggleWidget.__DA_slotIndex = i;

		if (!isCompact) {
			const lblW = node.addWidget(
				"text",
				`label_${i + 1}`,
				slot.label,
				(val) => {
					slot.label = String(val ?? "");
					toggleWidget.label = slot.label.trim() || `Slot ${i + 1}`;
					syncStorage(node);
					node.setDirtyCanvas?.(true, true);
				},
				{ default: slot.label },
			);
			lblW.value = slot.label;

			const trgW = node.addWidget(
				"text",
				`targets_${i + 1}`,
				slot.targets,
				(val) => {
					slot.targets = String(val ?? "");
					syncStorage(node);
					applyStateToGraph(node);
				},
				{ default: slot.targets },
			);
			trgW.value = slot.targets;

			const typeW = node.addWidget(
				"combo",
				`target_type_${i + 1}`,
				slot.targetType,
				(val) => {
					if (VALID_TARGET_TYPES.includes(val)) {
						slot.targetType = val;
						typeW.options.default = val;
						syncStorage(node);
						applyStateToGraph(node);
					}
				},
				{ values: VALID_TARGET_TYPES, default: slot.targetType },
			);
			typeW.value = slot.targetType;
		}
	}

	syncStorage(node);
	updateNodeDimensions(node);
	node.setDirtyCanvas?.(true, true);
};

// Securely subscribe to graph changes without graph.on (Nodes 2.0 compatible)
const bindGraphChangeHook = (graph) => {
	if (!graph || graph.__DA_changeHooked) return;
	graph.__DA_changeHooked = true;
	const origChange = graph.change;
	graph.change = function (...args) {
		const res = origChange?.apply(this, args);
		for (const g of getAllGraphs(app.graph)) {
			for (const n of getGraphNodes(g)) {
				if (n.type === "DA_NodeController_V2") syncFromGraph(n);
			}
		}
		return res;
	};
};
// --- 7. Registering an extension ---
app.registerExtension({
	name: "DA_NodeController_V2",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData?.name !== "DA_NodeController_V2") return;

		nodeType.prototype.serialize_widgets = false;

		nodeType.prototype.computeSize = function () {
			const cfg = ensureConfig(this);
			const width = Math.max(220, cfg.savedWidth || 240);
			const height = getBaseHeight(this) + Math.max(0, cfg.extraHeight || 0);
			return [width, height];
		};

		const origOnSerialize = nodeType.prototype.onSerialize;
		nodeType.prototype.onSerialize = function (data, ...args) {
			origOnSerialize?.call(this, data, ...args);
			captureCurrentSize(this);
			flushInputsToConfig(this);
			syncStorage(this);
			const cfg = ensureConfig(this);
			const height = getBaseHeight(this) + Math.max(0, cfg.extraHeight || 0);
			data.properties = data.properties || {};
			data.properties.__DA_json = this.properties.__DA_json;
			data.size = [cfg.savedWidth, height];
			data.widgets_values = [];
		};

		const origCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function (...args) {
			origCreated?.apply(this, args);
			this.serialize_widgets = false;
			rebuildWidgets(this);
		};

		const origConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function (info, ...args) {
			this.__DA_configuring = true;
			const savedJson = info?.properties?.__DA_json;
			if (info && Array.isArray(info.widgets_values)) {
				info.widgets_values = [];
			}
			if (savedJson) restoreStorage(this, savedJson);

			origConfigure?.call(this, info, ...args);
			this.serialize_widgets = false;

			if (savedJson) restoreStorage(this, savedJson);
			else restoreStorage(this);

			if (info && info.size && typeof info.size.length === "number") {
				const w = Number(info.size.at(0));
				if (Number.isFinite(w) && w >= 220) {
					ensureConfig(this).savedWidth = Math.round(w);
				}
			}

			rebuildWidgets(this);

			setTimeout(() => {
				if (savedJson) restoreStorage(this, savedJson);
				rebuildWidgets(this);
				this.__DA_configuring = false;
			}, 200);
		};

		const origAdded = nodeType.prototype.onAdded;
		nodeType.prototype.onAdded = function (...args) {
			origAdded?.apply(this, args);
			this.serialize_widgets = false;
			restoreStorage(this);
			rebuildWidgets(this);
			if (this.graph) bindGraphChangeHook(this.graph);
		};

		const origResize = nodeType.prototype.onResize;
		nodeType.prototype.onResize = function (size, ...args) {
			origResize?.call(this, size, ...args);
			if (!size || typeof size.length !== "number" || size.length < 2) return;

			const cfg = ensureConfig(this);
			const baseH = getBaseHeight(this);

			if (this.__DA_internalResize || this.__DA_configuring) {
				const targetW = Math.max(220, cfg.savedWidth || 240);
				const targetH = baseH + Math.max(0, cfg.extraHeight || 0);
				if (typeof size.set === "function") {
					size.set([targetW, targetH]);
				} else {
					size.splice(0, 2, targetW, targetH);
				}
				return;
			}

			const newW = Math.max(220, Math.round(Number(size.at(0)) || 240));
			const newH = Math.max(baseH, Math.round(Number(size.at(1)) || baseH));
			if (typeof size.set === "function") {
				size.set([newW, newH]);
			} else {
				size.splice(0, 2, newW, newH);
			}
			cfg.savedWidth = newW;
			cfg.extraHeight = Math.max(0, newH - baseH);
			syncStorage(this);
		};
	},

	getNodeMenuItems(node) {
		if (node?.type !== "DA_NodeController_V2") return [];
		flushInputsToConfig(node);
		syncStorage(node);
		const cfg = ensureConfig(node);
		return [
			{
				content: cfg.compactMode
					? "🚦 DA Controller V2: Full mode"
					: "🚦 DA Controller V2: Compact mode",
				callback: () => {
					flushInputsToConfig(node);
					cfg.compactMode = !cfg.compactMode;
					syncStorage(node);
					rebuildWidgets(node);
					applyStateToGraph(node);
				},
			},
		];
	},

	async loadedGraph() {
		setTimeout(() => {
			if (app.graph) bindGraphChangeHook(app.graph);
			for (const g of getAllGraphs(app.graph)) {
				for (const n of getGraphNodes(g)) {
					if (n.type === "DA_NodeController_V2") {
						restoreStorage(n);
						rebuildWidgets(n);
					}
				}
			}
		}, 180);
	},
});
