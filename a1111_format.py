#this file with no changes from https://github.com/seesee75-commits/ComfyUI-SeeSee-Civitai-Metadata 
# Copyright (c) 2026 seesee75
"""Turn a traced generation into the A1111 "parameters" text Civitai reads.

Civitai's reader (civitai/media-metadata, src/image/parsers/registry.ts) tries the A1111
parser *before* the ComfyUI one, so a PNG that carries a ``parameters`` chunk is read from
that chunk even when ComfyUI's ``prompt``/``workflow`` chunks sit next to it. The rules
that shape this file all come from that parser:

* The details line must start with ``Steps: `` or the image is not detected as A1111.
* ``Negative prompt:`` is split on anywhere in the text, and a prompt line that starts with
  ``Steps: `` would be taken for the details line, so both are defused in prompt text.
* Validation is all-or-nothing: one field of the wrong type and Civitai drops *all*
  metadata. Numbers are written as plain numbers, hashes as strings.
* Resources are matched by exact hash string. 10 hex chars = AutoV2 (SHA256 prefix), which
  Civitai stores for every file. Only the checkpoint, LoRAs and embeddings are hashed:
  VAE and text-encoder hashes get attributed to whoever uploaded that file first.
"""

from __future__ import annotations

import json
import re

SAMPLER_LABELS = {
    "euler": "Euler",
    "euler_ancestral": "Euler a",
    "heun": "Heun",
    "dpm_2": "DPM2",
    "dpm_2_ancestral": "DPM2 a",
    "lms": "LMS",
    "dpm_fast": "DPM fast",
    "dpm_adaptive": "DPM adaptive",
    "dpmpp_2s_ancestral": "DPM++ 2S a",
    "dpmpp_sde": "DPM++ SDE",
    "dpmpp_sde_gpu": "DPM++ SDE",
    "dpmpp_2m": "DPM++ 2M",
    "dpmpp_2m_sde": "DPM++ 2M SDE",
    "dpmpp_2m_sde_gpu": "DPM++ 2M SDE",
    "dpmpp_3m_sde": "DPM++ 3M SDE",
    "dpmpp_3m_sde_gpu": "DPM++ 3M SDE",
    "ddim": "DDIM",
    "plms": "PLMS",
    "uni_pc": "UniPC",
    "uni_pc_bh2": "UniPC",
    "lcm": "LCM",
}

SCHEDULER_LABELS = {
    "simple": "Simple",
    "normal": "Normal",
    "karras": "Karras",
    "exponential": "Exponential",
    "polyexponential": "Polyexponential",
    "sgm_uniform": "SGM Uniform",
    "ddim_uniform": "DDIM",
    "beta": "Beta",
    "linear_quadratic": "Linear Quadratic",
    "kl_optimal": "KL Optimal",
    "align_your_steps": "Align Your Steps",
}


def sampler_label(name):
    if not name:
        return None
    return SAMPLER_LABELS.get(name, name)


def scheduler_label(name):
    if not name:
        return None
    return SCHEDULER_LABELS.get(name, name.replace("_", " ").title())


def fmt_number(value):
    if value is None:
        return None
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def quote(value):
    """A1111's infotext quote(): JSON-quote a value that would break the details line."""
    text = str(value)
    if any(ch in text for ch in ',\n:"'):
        return json.dumps(text, ensure_ascii=False)
    return text


def clean_prompt(text):
    """Keep prompt text from being misread as structure by the A1111 parser."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"(?i)negative prompt:", "negative prompt :", text)
    text = re.sub(r"(?m)^Steps: ", "Steps : ", text)
    return text


def hash_key_name(name):
    # Names end up inside `Lora hashes: "a: 1, b: 2"`. Civitai only parses that block as
    # key/value pairs when it matches ^[\w][\w\s.+-]*: — otherwise it iterates the string
    # character by character and invents junk resources. Matching is by hash anyway, so
    # the name is only a label and can be made safe.
    safe = re.sub(r"[^A-Za-z0-9_ .+\-]", "_", name).strip()
    if not safe or not re.match(r"[A-Za-z0-9_]", safe):
        safe = "_" + safe
    return safe


def build_parameters(generation, width, height, resource_info, generator="ComfyUI"):
    """resource_info(resource) -> (autov2_hash or None, civitai_version_id or None)."""
    base = generation.base
    final = generation.final
    multi_pass = len(generation.passes) > 1

    fields = []

    def add(key, value):
        if value is None or value == "":
            return
        fields.append(f"{key}: {value}")

    add("Steps", base.steps if base.steps is not None else 0)
    add("Sampler", quote(sampler_label(base.sampler)) if base.sampler else None)
    add("Schedule type", quote(scheduler_label(base.scheduler)) if base.scheduler else None)
    add("CFG scale", fmt_number(base.cfg))
    if base.guidance is not None:
        add("Distilled CFG Scale", fmt_number(base.guidance))
    add("Seed", base.seed)
    add("Size", f"{width}x{height}")

    hashes = {}
    civitai_resources = []

    def remember(resource, key, civitai_type):
        digest, version_id = resource_info(resource)
        if digest:
            hashes[key] = digest
        if version_id:
            entry = {"type": civitai_type}
            if resource.weight is not None and civitai_type != "checkpoint":
                entry["weight"] = round(float(resource.weight), 4)
            entry["modelVersionId"] = int(version_id)
            civitai_resources.append(entry)
        return digest

    if base.model is not None:
        digest = remember(base.model, "model", "checkpoint")
        add("Model hash", digest)
        add("Model", quote(base.model.name))
    add("Generator", generator)

    if not multi_pass and base.denoise is not None and base.denoise < 1:
        add("Denoising strength", fmt_number(base.denoise))

    if multi_pass:
        add("Hires steps", final.steps)
        add("Denoising strength", fmt_number(final.denoise))
        add("Hires upscaler", quote(final.upscaler) if final.upscaler else None)
        add("Hires resize", f"{width}x{height}")
        if (final.model is not None and base.model is not None
                and final.model.filename.lower() != base.model.filename.lower()):
            digest, _ = resource_info(final.model)
            add("Refiner", quote(final.model.name))
            add("Refiner hash", digest)

    loras = []
    seen = set()
    for sampler_pass in generation.passes:
        for lora in sampler_pass.loras:
            key = lora.filename.lower()
            if key not in seen:
                seen.add(key)
                loras.append(lora)

    lora_hashes = []
    for lora in loras:
        digest = remember(lora, f"lora:{hash_key_name(lora.name)}", "lora")
        if digest:
            lora_hashes.append(f"{hash_key_name(lora.name)}: {digest}")
    if lora_hashes:
        add("Lora hashes", json.dumps(", ".join(lora_hashes), ensure_ascii=False))

    ti_hashes = []
    for emb in generation.embeddings:
        digest = remember(emb, f"embed:{hash_key_name(emb.name)}", "embed")
        if digest:
            ti_hashes.append(f"{hash_key_name(emb.name)}: {digest}")
    if ti_hashes:
        add("TI hashes", json.dumps(", ".join(ti_hashes), ensure_ascii=False))

    if hashes:
        add("Hashes", json.dumps(hashes, ensure_ascii=False))
    if civitai_resources:
        add("Civitai resources", json.dumps(civitai_resources, ensure_ascii=False, separators=(",", ":")))

    prompt = clean_prompt(base.positive)
    negative = clean_prompt(base.negative)
    return f"{prompt}\nNegative prompt: {negative}\n" + ", ".join(fields)
