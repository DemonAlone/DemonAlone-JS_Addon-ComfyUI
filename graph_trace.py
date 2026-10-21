#based on ComfyUI-SeeSee-Civitai-Metadata from https://github.com/seesee75-commits/ComfyUI-SeeSee-Civitai-Metadata 
# Copyright (c) 2026 seesee75
"""Walk a ComfyUI prompt graph backwards from a save node and recover the generation
parameters that produced the image.

Pure Python on purpose: nothing here imports ComfyUI, so the whole tracer can be tested
offline against the prompt JSON of real images. The ComfyUI side (node classes, runtime
output cache, model folders) is injected through the callables on ``Graph``.

Why runtime values matter: in real workflows the prompt text, seed or step count very
often arrive through a link (a primitive node, a prompt enhancer, a seed node, an rgthree
config node). The prompt JSON only records the link, not the value. ComfyUI keeps every
node's outputs in its cache while the prompt runs, so the tracer reads the value that
actually flowed through the link, and only falls back to evaluating simple nodes
statically when the cache does not have it.
"""

from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field

import logging
log = logging.getLogger("demonalone.CivitaiMetadata.trace")


MISSING = object()

MODEL_EXTENSIONS = (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".sft")

# Input names that carry the latent/image a sampler starts from.
LATENT_INPUTS = ("latent_image", "latent", "samples", "image", "images", "pixels")

# Text inputs of prompt encoders, in order of preference. populated_text beats
# wildcard_text (Impact's wildcard encoder), t5xxl beats clip_l (Flux).
TEXT_INPUTS = (
    "text", "prompt", "positive", "negative", "positive_prompt", "negative_prompt",
    "t5xxl", "text_g", "clip_l", "text_l", "populated_text", "wildcard_text",
    "string", "value",
)

SAMPLER_CLASS_NAMES = {
    "SamplerEulerAncestral": "euler_ancestral",
    "SamplerEulerAncestralCFGPP": "euler_ancestral_cfg_pp",
    "SamplerLMS": "lms",
    "SamplerDPMPP_2M_SDE": "dpmpp_2m_sde",
    "SamplerDPMPP_3M_SDE": "dpmpp_3m_sde",
    "SamplerDPMPP_SDE": "dpmpp_sde",
    "SamplerDPMPP_2S_Ancestral": "dpmpp_2s_ancestral",
    "SamplerDPMAdaptative": "dpm_adaptive",
    "SamplerER_SDE": "er_sde",
    "SamplerSASolver": "sa_solver",
    "SamplerLCMUpscale": "lcm",
}

SCHEDULER_CLASS_NAMES = {
    "KarrasScheduler": "karras",
    "ExponentialScheduler": "exponential",
    "PolyexponentialScheduler": "polyexponential",
    "VPScheduler": "vp",
    "BetaSamplingScheduler": "beta",
    "SDTurboScheduler": "sd_turbo",
    "AlignYourStepsScheduler": "align_your_steps",
    "GITSScheduler": "gits",
    "LaplaceScheduler": "laplace",
    "OptimalStepsScheduler": "optimal_steps",
}

# Nodes that only transform a SIGMAS tensor; the real scheduler sits behind them.
SIGMA_PASSTHROUGH = ("SplitSigmas", "SplitSigmasDenoise", "FlipSigmas", "SetFirstSigma",
                     "ExtendIntermediateSigmas")

# rgthree's config node names its outputs STEPS/REFINER_STEP/..., not after its inputs.
MULTI_OUTPUT_INPUTS = {
    "KSampler Config (rgthree)": ("steps_total", "refiner_step", "cfg", "sampler_name", "scheduler"),
}

# Single-value nodes: the output is simply this input.
VALUE_INPUTS = ("value", "seed", "noise_seed", "int", "float", "string", "text", "number",
                "boolean", "source", "input", "anything", "any")

def is_link(value) -> bool:
    return (isinstance(value, (list, tuple)) and len(value) == 2
            and isinstance(value[0], (str, int)) and isinstance(value[1], int)
            and not isinstance(value[1], bool))


@dataclass
class Resource:
    kind: str            # "checkpoint" | "lora" | "embedding"
    filename: str        # as the loader saw it, e.g. "krea2\\model.safetensors"
    category: str        # ComfyUI folder category the file was found in
    weight: float | None = None

    @property
    def name(self) -> str:
        base = re.split(r"[\\/]", self.filename)[-1]
        for ext in MODEL_EXTENSIONS:
            if base.lower().endswith(ext):
                return base[: -len(ext)]
        return base


@dataclass
class SamplerPass:
    node_id: str
    class_type: str
    seed: int | None = None
    steps: int | None = None
    cfg: float | None = None
    sampler: str | None = None
    scheduler: str | None = None
    denoise: float | None = None
    guidance: float | None = None
    positive: str | None = None
    negative: str | None = None
    model: Resource | None = None
    loras: list = field(default_factory=list)
    upscaler: str | None = None   # upscale step between the previous pass and this one


@dataclass
class Generation:
    passes: list                  # root pass first, final pass last
    embeddings: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    @property
    def base(self) -> SamplerPass:
        return self.passes[0]

    @property
    def final(self) -> SamplerPass:
        return self.passes[-1]


class Graph:
    """Read-only view on a prompt graph with optional runtime values.

    get_node(node_id)      -> {"class_type": ..., "inputs": {...}} or None
    get_runtime(id, slot)  -> the value that node produced on that output, or MISSING
    get_class(class_type)  -> the node class (for RETURN_TYPES/RETURN_NAMES) or None
    find_file(name, cats)  -> (category, name as listed) if the file exists in a model folder
    """

    def __init__(self, get_node, get_runtime=None, get_class=None, find_file=None):
        self._get_node = get_node
        self._get_runtime = get_runtime or (lambda nid, slot: MISSING)
        self._get_class = get_class or (lambda ct: None)
        self._find_file = find_file or (lambda name, cats: None)

    # ------------------------------------------------------------------ basics
    def node(self, nid):
        return self._get_node(str(nid))

    def class_type(self, nid) -> str:
        node = self.node(nid)
        return node.get("class_type", "") if node else ""

    def inputs(self, nid) -> dict:
        node = self.node(nid)
        return (node or {}).get("inputs", {}) or {}

    def _class_attr(self, nid, attr):
        cls = self._get_class(self.class_type(nid))
        if cls is None:
            return None
        try:
            # Get rid of dynamic attr to pass static analysis
            if attr == "RETURN_TYPES":
                return getattr(cls, "RETURN_TYPES", None)
            elif attr == "RETURN_NAMES":
                return getattr(cls, "RETURN_NAMES", None)
            return None
        except Exception:
            return None


    def output_type(self, nid, slot):
        types = self._class_attr(nid, "RETURN_TYPES")
        try:
            value = types[slot]
        except Exception:
            return None
        return value if isinstance(value, str) else "COMBO"

    def output_name(self, nid, slot) -> str:
        names = self._class_attr(nid, "RETURN_NAMES")
        try:
            return str(names[slot] or "")
        except Exception:
            return ""

    def find_file(self, name, categories):
        if not isinstance(name, str) or not name.strip():
            return None
        try:
            return self._find_file(name, categories)
        except Exception:
            return None

    # ------------------------------------------------------------------ values
    def resolve(self, value, depth=0):
        """Literal as-is; a link becomes the value that flowed through it (or None)."""
        if not is_link(value):
            return value
        if depth > 32:
            return None
        nid, slot = str(value[0]), value[1]
        runtime = self._get_runtime(nid, slot)
        if runtime is not MISSING and runtime is not None:
            return runtime
        return self._static_output(nid, slot, depth + 1)

    def resolve_scalar(self, value, types=(str, int, float, bool)):
        result = self.resolve(value)
        if isinstance(result, (list, tuple)) and len(result) == 1:
            result = result[0]
        return result if isinstance(result, types) else None

    def _static_output(self, nid, slot, depth):
        """Evaluate a handful of trivial nodes when the runtime cache has no value."""
        ct = self.class_type(nid)
        ins = self.inputs(nid)
        if not ct:
            return None
        if ct in MULTI_OUTPUT_INPUTS:
            names = MULTI_OUTPUT_INPUTS[ct]
            if slot < len(names) and names[slot] in ins:
                return self.resolve(ins[names[slot]], depth)
            return None
        if ct == "Reroute":
            for v in ins.values():
                return self.resolve(v, depth)
            return None
        if ct == "StringConcatenate":
            a = self.resolve(ins.get("string_a"), depth)
            b = self.resolve(ins.get("string_b"), depth)
            delim = self.resolve(ins.get("delimiter", ""), depth) or ""
            if isinstance(a, str) and isinstance(b, str):
                return f"{a}{delim}{b}"
            return None
        if ct == "StringReplace":
            s = self.resolve(ins.get("string"), depth)
            find = self.resolve(ins.get("find"), depth)
            rep = self.resolve(ins.get("replace"), depth)
            if all(isinstance(x, str) for x in (s, find, rep)):
                return s.replace(find, rep)
            return None
        out_name = self.output_name(nid, slot).lower()
        if out_name and out_name in ins:
            return self.resolve(ins[out_name], depth)
        present = [k for k in VALUE_INPUTS if k in ins]
        if len(present) >= 1:
            return self.resolve(ins[present[0]], depth)
        return None

    # ------------------------------------------------------------------ search
    def upstream(self, start_link, accept, follow_types, limit=400):
        """Breadth-first search from a link. Returns (node_id, visited_ids) for the first
        node satisfying ``accept``; only links whose source output type is in
        ``follow_types`` (or unknown) are followed."""
        if not is_link(start_link):
            return None, []
        queue = deque([str(start_link[0])])
        seen = set()
        visited = []
        while queue and len(seen) < limit:
            nid = queue.popleft()
            if nid in seen or self.node(nid) is None:
                continue
            seen.add(nid)
            if accept(nid):
                return nid, visited
            visited.append(nid)
            for value in self.inputs(nid).values():
                if not is_link(value):
                    continue
                src = str(value[0])
                out_type = self.output_type(src, value[1])
                if out_type is None or out_type == "*" or out_type in follow_types:
                    queue.append(src)
        return None, visited

    def is_sampler(self, nid) -> bool:
        ct = self.class_type(nid)
        if ct == "SamplerCustomAdvanced":
            return True
        names = set(self.inputs(nid))
        has_model = bool(names & {"model", "guider"})
        has_progress = bool(names & {"steps", "sigmas", "seed", "noise_seed", "noise"})
        has_start = bool(names & set(LATENT_INPUTS))
        return has_model and has_progress and has_start


# ---------------------------------------------------------------------- tracing
def trace(graph: Graph, save_node_id, images_input="images") -> Generation | None:
    save_inputs = graph.inputs(save_node_id)
    link = save_inputs.get(images_input)
    if not is_link(link):
        return None

    passes = []
    visited_between = []
    current_link = link
    seen_samplers = set()
    while True:
        sampler_id, visited = graph.upstream(current_link, graph.is_sampler, ("IMAGE", "LATENT"))
        if sampler_id is None or sampler_id in seen_samplers:
            break
        seen_samplers.add(sampler_id)
        sampler_pass = _read_sampler(graph, sampler_id)
        passes.append(sampler_pass)
        visited_between.append(visited)
        start = None
        ins = graph.inputs(sampler_id)
        for name in LATENT_INPUTS:
            if is_link(ins.get(name)):
                start = ins[name]
                break
        if start is None:
            break
        current_link = start

    if not passes:
        return None

    passes.reverse()
    visited_between.reverse()
    # visited_between[i] now holds the nodes between pass i and whatever consumed it
    # (the next pass, or the save node for the last one). The upscaler of pass i+1 is
    # among the nodes between pass i and pass i+1, plus pass i+1 itself (UltimateSDUpscale).
    for i in range(1, len(passes)):
        candidates = list(visited_between[i - 1]) + [passes[i].node_id]
        passes[i].upscaler = _find_upscaler(graph, candidates)

    generation = Generation(passes=passes)
    texts = [p.positive for p in passes if p.positive] + [p.negative for p in passes if p.negative]
    generation.embeddings = _find_embeddings(graph, texts)
    if passes[0].positive is None:
        generation.warnings.append("prompt text not found")
    if passes[0].model is None:
        generation.warnings.append("model file not found")
    return generation


def _first_link(ins, names):
    for name in names:
        if is_link(ins.get(name)):
            return ins[name]
    return None


def _number(graph, value, kind):
    result = graph.resolve_scalar(value, (int, float, str))
    if isinstance(result, bool) or result is None:
        return None
    try:
        return kind(result)
    except (TypeError, ValueError):
        return None


def _read_sampler(graph: Graph, nid) -> SamplerPass:
    ct = graph.class_type(nid)
    ins = graph.inputs(nid)
    p = SamplerPass(node_id=str(nid), class_type=ct)

    for key in ("seed", "noise_seed"):
        if key in ins:
            p.seed = _number(graph, ins[key], int)
            break
    if "steps" in ins:
        p.steps = _number(graph, ins["steps"], int)
    if "cfg" in ins:
        p.cfg = _number(graph, ins["cfg"], float)
    if "sampler_name" in ins:
        p.sampler = graph.resolve_scalar(ins["sampler_name"], (str,))
    if "scheduler" in ins:
        p.scheduler = graph.resolve_scalar(ins["scheduler"], (str,))
    if "denoise" in ins:
        p.denoise = _number(graph, ins["denoise"], float)

    model_link = ins.get("model")
    positive_link = ins.get("positive")
    negative_link = ins.get("negative")

    # SamplerCustom / SamplerCustomAdvanced components
    if is_link(ins.get("noise")):
        noise_id = str(ins["noise"][0])
        noise_ins = graph.inputs(noise_id)
        for key in ("noise_seed", "seed"):
            if key in noise_ins:
                p.seed = _number(graph, noise_ins[key], int)
                break
        if p.seed is None and graph.class_type(noise_id) != "DisableNoise":
            obj = graph.resolve(ins["noise"])
            seed = getattr(obj, "seed", None)
            if isinstance(seed, int):
                p.seed = seed

    if is_link(ins.get("sampler")):
        sampler_id = str(ins["sampler"][0])
        s_ins = graph.inputs(sampler_id)
        if "sampler_name" in s_ins:
            p.sampler = graph.resolve_scalar(s_ins["sampler_name"], (str,))
        if p.sampler is None:
            p.sampler = SAMPLER_CLASS_NAMES.get(graph.class_type(sampler_id))
        if p.sampler is None:
            obj = graph.resolve(ins["sampler"])
            fn = getattr(obj, "sampler_function", None)
            name = getattr(fn, "__name__", "")
            if name.startswith("sample_"):
                p.sampler = name[len("sample_"):]

    if is_link(ins.get("sigmas")):
        sched_id = str(ins["sigmas"][0])
        for _ in range(8):
            if graph.class_type(sched_id) in SIGMA_PASSTHROUGH and is_link(graph.inputs(sched_id).get("sigmas")):
                sched_id = str(graph.inputs(sched_id)["sigmas"][0])
            else:
                break
        s_ins = graph.inputs(sched_id)
        if "steps" in s_ins:
            p.steps = _number(graph, s_ins["steps"], int)
        if "scheduler" in s_ins:
            p.scheduler = graph.resolve_scalar(s_ins["scheduler"], (str,))
        if p.scheduler is None:
            p.scheduler = SCHEDULER_CLASS_NAMES.get(graph.class_type(sched_id))
        if "denoise" in s_ins:
            p.denoise = _number(graph, s_ins["denoise"], float)
        if model_link is None and is_link(s_ins.get("model")):
            model_link = s_ins["model"]
        if p.steps is None:
            sigmas = graph.resolve(ins["sigmas"])
            try:
                p.steps = max(int(len(sigmas)) - 1, 0) or None
            except Exception as e:
                log.debug("[Civitai Metadata] Failed to calculate steps from sigmas: %s", e)

    if is_link(ins.get("guider")):
        guider_id = str(ins["guider"][0])
        g_ins = graph.inputs(guider_id)
        for key in ("cfg", "cfg_conds"):
            if key in g_ins:
                p.cfg = _number(graph, g_ins[key], float)
                break
        if p.cfg is None and graph.class_type(guider_id) == "BasicGuider":
            p.cfg = 1.0
        if p.cfg is None:
            cfg = getattr(graph.resolve(ins["guider"]), "cfg", None)
            if isinstance(cfg, (int, float)) and not isinstance(cfg, bool):
                p.cfg = float(cfg)
        model_link = g_ins.get("model", model_link)
        positive_link = _first_link(g_ins, ("positive", "conditioning", "cond1")) or positive_link
        negative_link = g_ins.get("negative", negative_link)

    if is_link(positive_link):
        p.positive, p.guidance = _find_text(graph, positive_link, want_negative=False)
    if is_link(negative_link):
        p.negative, _ = _find_text(graph, negative_link, want_negative=True)
    if is_link(model_link):
        p.model, p.loras = _find_models(graph, model_link)
    return p


def _find_text(graph: Graph, link, want_negative):
    """Follow a CONDITIONING link to the encoder and return (text, flux_guidance)."""
    guidance = None
    queue = deque([link])
    seen = set()
    while queue and len(seen) < 200:
        current = queue.popleft()
        nid, slot = str(current[0]), current[1]
        if (nid, slot) in seen or graph.node(nid) is None:
            continue
        seen.add((nid, slot))
        ct = graph.class_type(nid)
        ins = graph.inputs(nid)
        if ct == "ConditioningZeroOut":
            return "", guidance
        if ct == "FluxGuidance" and guidance is None:
            guidance = _number(graph, ins.get("guidance"), float)

        text = _text_from_encoder(graph, nid, slot, want_negative)
        if text is not None:
            return text, guidance

        for name, value in ins.items():
            if not is_link(value):
                continue
            out_type = graph.output_type(str(value[0]), value[1])
            if out_type not in (None, "*", "CONDITIONING"):
                continue
            lname = name.lower()
            if want_negative and "pos" in lname and "neg" not in lname:
                continue
            if not want_negative and "neg" in lname:
                continue
            queue.append(value)
    return None, guidance


def _text_from_encoder(graph: Graph, nid, slot, want_negative):
    ins = graph.inputs(nid)
    out_name = graph.output_name(nid, slot).lower()
    wants_neg = want_negative or "neg" in out_name
    if "pos" in out_name and "neg" not in out_name:
        wants_neg = False

    candidates = []
    for key in TEXT_INPUTS:
        if key not in ins:
            continue
        lkey = key.lower()
        is_neg_key = "neg" in lkey
        is_pos_key = "pos" in lkey
        if wants_neg and is_pos_key:
            continue
        if not wants_neg and is_neg_key:
            continue
        candidates.append((0 if (wants_neg and is_neg_key) or (not wants_neg and is_pos_key) else 1, key))
    candidates.sort(key=lambda item: item[0])
    for _, key in candidates:
        value = graph.resolve_scalar(ins[key], (str,))
        if value is not None:
            return value
    return None


def _file_categories(input_name):
    name = input_name.lower()
    if name == "ckpt_name":
        return ("checkpoints",)
    if name in ("unet_name", "diffusion_model"):
        return ("diffusion_models", "unet_gguf", "checkpoints")
    if "lora" in name:
        return ("loras",)
    return ("checkpoints", "diffusion_models", "unet_gguf", "loras")


def _lora_weight(graph, ins):
    for key in ("strength_model", "strength", "lora_strength", "model_strength", "weight"):
        if key in ins:
            value = _number(graph, ins[key], float)
            if value is not None:
                return value
    return None


def _find_models(graph: Graph, link):
    """Walk the MODEL chain and collect the base model file and every LoRA on it."""
    model = None
    loras = []          # (node discovery index, resource)
    seen_files = set()
    node_index = 0

    def add(resource):
        nonlocal model
        key = (resource.category, resource.filename.lower())
        if key in seen_files:
            return
        seen_files.add(key)
        if resource.kind == "lora":
            loras.append((node_index, resource))
        elif model is None:
            model = resource

    def consider_file(input_name, value, weight=None, categories=None):
        if not isinstance(value, str):
            return
        stripped = value.strip()
        if not stripped:
            return
        looks_like_file = stripped.lower().endswith(MODEL_EXTENSIONS)
        lname = input_name.lower()
        if not looks_like_file and not any(k in lname for k in ("ckpt", "unet", "lora", "model_name")):
            return
        found = graph.find_file(stripped, categories or _file_categories(input_name))
        if not found:
            return
        category, filename = found
        kind = "lora" if category == "loras" else "checkpoint"
        add(Resource(kind=kind, filename=filename, category=category,
                     weight=weight if kind == "lora" else None))

    def consider_lora_entries(entries):
        for entry in entries or []:
            if isinstance(entry, dict):
                if entry.get("active", entry.get("on", True)) is False:
                    continue
                name = entry.get("lora") or entry.get("name") or entry.get("path")
                strength = entry.get("strength", entry.get("model_strength"))
                try:
                    strength = float(strength) if strength is not None else None
                except (TypeError, ValueError):
                    strength = None
                if strength == 0:
                    continue
                consider_file("lora_name", name, strength, ("loras",))
            elif isinstance(entry, (list, tuple)) and entry and isinstance(entry[0], str):
                strength = entry[1] if len(entry) > 1 and isinstance(entry[1], (int, float)) else None
                if strength == 0:
                    continue
                consider_file("lora_name", entry[0], strength, ("loras",))

    queue = deque([str(link[0])])
    seen = set()
    while queue and len(seen) < 300:
        nid = queue.popleft()
        if nid in seen or graph.node(nid) is None:
            continue
        seen.add(nid)
        node_index = len(seen)
        ins = graph.inputs(nid)
        weight = _lora_weight(graph, ins)
        for name, value in ins.items():
            if is_link(value):
                src = str(value[0])
                out_type = graph.output_type(src, value[1])
                if out_type in (None, "*", "MODEL"):
                    queue.append(src)
                if (out_type and "LORA" in out_type.upper()) or "lora_stack" in name.lower():
                    stack = graph.resolve(value)
                    if isinstance(stack, (list, tuple)):
                        consider_lora_entries(stack)
                    if out_type is None or "LORA" in (out_type or "").upper():
                        queue.append(src)
                if any(k in name.lower() for k in ("ckpt_name", "unet_name", "lora_name")):
                    consider_file(name, graph.resolve_scalar(value, (str,)), weight)
                continue
            if isinstance(value, str):
                if weight == 0 and "lora" in name.lower():
                    continue
                consider_file(name, value, weight)
            elif isinstance(value, dict):
                if "__value__" in value and isinstance(value["__value__"], list):
                    consider_lora_entries(value["__value__"])
                elif "lora" in value:
                    consider_lora_entries([value])
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                consider_lora_entries(value)
    # The search starts at the sampler, so the loader nearest the checkpoint is found last.
    # Report LoRAs in the order they are applied; entries of one node keep their order.
    ordered = sorted(enumerate(loras), key=lambda item: (-item[1][0], item[0]))
    return model, [resource for _, (_, resource) in ordered]


def _find_upscaler(graph: Graph, node_ids):
    model_name = None
    method = None
    for nid in node_ids:
        ct = graph.class_type(nid)
        ins = graph.inputs(nid)
        link = ins.get("upscale_model")
        if is_link(link) and model_name is None:
            loader = graph.inputs(str(link[0]))
            name = graph.resolve_scalar(loader.get("model_name"), (str,))
            if name:
                model_name = re.split(r"[\\/]", name)[-1]
        if method is None and ("Upscale" in ct or ct.startswith("ImageScale") or "Resize" in ct):
            if "upscale_method" in ins:
                value = graph.resolve_scalar(ins["upscale_method"], (str,))
                if value:
                    method = f"Latent ({value})" if "Latent" in ct else value
    return model_name or method

def _find_embeddings(graph: Graph, texts):
    found = []
    seen = set()
    for text in texts:
        # Pass the regular expression directly to re.finditer and add a flag
        for match in re.finditer(r"embedding:([^\s,()[\]{}<>|]+)", text or "", flags=re.IGNORECASE):
            raw = match.group(1).rstrip(".:")
            hit = graph.find_file(raw, ("embeddings",))
            if not hit:
                continue
            key = hit[1].lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(Resource(kind="embedding", filename=hit[1], category=hit[0]))
    return found