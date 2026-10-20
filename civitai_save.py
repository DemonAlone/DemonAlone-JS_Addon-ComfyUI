#based on ComfyUI-SeeSee-Civitai-Metadata from https://github.com/seesee75-commits/ComfyUI-SeeSee-Civitai-Metadata 
# Copyright (c) 2026 seesee75
# Save Image (Civitai Metadata): a drop-in replacement for ComfyUI's Save Image node.

from __future__ import annotations

import gc
import json
import logging
import os
import re
import sys

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import folder_paths
import nodes as comfy_nodes
from comfy.cli_args import args

from .a1111_format import build_parameters, sampler_label, scheduler_label
from .graph_trace import MISSING, Graph, trace
from .model_hashes import HashStore

log = logging.getLogger("SeeSee.CivitaiMetadata")

HASH_STORE = HashStore(os.path.join(folder_paths.get_user_directory(),
                                    "seesee-civitai-metadata", "hash_cache.json"))

# EXIF UserComment (tag 0x9286) belongs to the Exif Sub-IFD, not to IFD0. PIL will
# happily write it to IFD0 if asked, and some readers (exiftool, MediaInfo, Civitai)
# only look in the Sub-IFD, which is where A1111 puts it via piexif.
_EXIF_USER_COMMENT = 0x9286
_EXIF_SUB_IFD = 0x8769


def _jpeg_exif_bytes(img, user_comment):
    """Build JPEG EXIF bytes with UserComment in the Exif Sub-IFD, or None."""
    # Preferred: piexif is what A1111 uses and what exiftool is guaranteed to read.
    try:
        import piexif
        return piexif.dump({
            "0th": {},
            "Exif": {piexif.ExifIFD.UserComment: user_comment},
            "GPS": {},
            "1st": {},
            "thumbnail": None,
        })
    except ImportError:
        pass
    except Exception as exc:
        log.warning("[Civitai Metadata] piexif could not build EXIF: %s", exc)
        return None

    # Fallback: Pillow's Exif, forced into the Exif Sub-IFD. Needs Pillow >= 8.3 for
    # nested-IFD serialisation; older versions only write to IFD0 and miss the point.
    try:
        exif = img.getexif()
        exif.get_ifd(_EXIF_SUB_IFD)[_EXIF_USER_COMMENT] = user_comment
        return exif.tobytes()
    except Exception as exc:
        log.warning("[Civitai Metadata] could not build EXIF via Pillow: %s", exc)
        return None


@staticmethod
def _save_jpeg(img, path, parameters_text, quality):
    quality = max(1, min(100, int(quality)))
    if parameters_text:
        user_comment = b"UNICODE\x00" + parameters_text.encode("utf-16-be")
        exif_bytes = _jpeg_exif_bytes(img, user_comment)
        if exif_bytes:
            try:
                img.save(path, format="JPEG", quality=quality, exif=exif_bytes)
                return
            except Exception:
                log.warning("[Civitai Metadata] could not attach EXIF to %s; "
                            "saving the JPEG without it", path)
    img.save(path, format="JPEG", quality=quality)

PNG_FORMATS = ("PNG_with_workflow", "PNG_only_parameters", "PNG_with_no_meta")
JPG_FORMATS = ("JPG_only_parameters", "JPG_with_no_meta")
ALL_FORMATS = PNG_FORMATS + JPG_FORMATS

class _ComfyAdapter:
    """Connects the ComfyUI-free tracer to the running ComfyUI safely without using stack frames."""

    def __init__(self, dynprompt, prompt):
        self.dynprompt = dynprompt
        self.prompt = prompt or {}
        self._indexes = {}

        # Trying to get the output cache directly from the dynprompt object (Nodes 2.0 / API v2)
        self.cache = None
        if hasattr(dynprompt, "execution_cache"):
            self.cache = getattr(dynprompt.execution_cache, "outputs", None)
        
        # If not found in dynprompt, use the safe garbage collector gc.get_referrers instead of sys._getframe
        if self.cache is None:
            try:
                import execution
                for obj in gc.get_referrers(execution.PromptExecutor):
                    if isinstance(obj, execution.PromptExecutor):
                        self.cache = getattr(getattr(obj, "caches", None), "outputs", None)
                        if self.cache is not None:
                            break
            except Exception:
                pass

    def get_node(self, nid):
        if self.dynprompt is not None:
            try:
                return self.dynprompt.get_node(nid)
            except Exception:
                pass
        return self.prompt.get(nid)

    def get_runtime(self, nid, slot):
        if self.cache is None:
            return MISSING
        try:
            # Support for both the new local cache and the old dictionary interface
            if hasattr(self.cache, "get_local"):
                entry = self.cache.get_local(nid)
            else:
                entry = self.cache.get(nid)
        except Exception:
            return MISSING
        if entry is None:
            return MISSING
        outputs = getattr(entry, "outputs", entry)
        try:
            value = outputs[slot]
        except Exception:
            return MISSING
        if isinstance(value, list):
            return value[0] if value else MISSING
        return value

    @staticmethod
    def get_class(class_type):
        return comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)

    def _index(self, category):
        if category not in self._indexes:
            index = {}
            try:
                names = folder_paths.get_filename_list(category)
            except Exception:
                names = []
            for name in names:
                base = name.replace("\\", "/").split("/")[-1]
                index.setdefault(base.lower(), name)
                index.setdefault(os.path.splitext(base)[0].lower(), name)
            self._indexes[category] = index
        return self._indexes[category]

    def find_file(self, name, categories):
        for category in categories:
            try:
                if folder_paths.get_full_path(category, name):
                    return category, name
            except Exception:
                continue
        base = name.replace("\\", "/").split("/")[-1]
        for category in categories:
            index = self._index(category)
            hit = index.get(base.lower()) or index.get(os.path.splitext(base)[0].lower())
            if hit:
                return category, hit
        return None

    @staticmethod
    def resource_info(resource):
        try:
            full_path = folder_paths.get_full_path(resource.category, resource.filename)
        except Exception:
            full_path = None
        sha, version_id = HASH_STORE.info(full_path)
        return (sha[:10] if sha else None), version_id

class DA_SaveImage:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The images to save."}),
                "filename_prefix": ("STRING", {
                    "default": "ComfyUI",
                    "tooltip": "The prefix for the file to save. Same formatting options as "
                               "the normal Save Image node (%date:yyyy-MM-dd%, %Node.widget%), "
                               "plus %label% which expands to the label input below.",
                }),
                "file_format": (ALL_FORMATS, {
                    "default": "PNG_with_workflow",
                    "tooltip": "PNG_with_workflow: A1111 'parameters' plus ComfyUI's prompt/"
                               "workflow chunks, so the PNG can be dragged back into ComfyUI. "
                               "PNG_only_parameters: A1111 'parameters' only. "
                               "PNG_with_no_meta: a bare PNG, no chunks at all (the graph is "
                               "not traced). "
                               "JPG_only_parameters: JPEG with the parameters text in EXIF "
                               "UserComment (Civitai reads it; ComfyUI cannot drag-and-drop "
                               "from it). "
                               "JPG_with_no_meta: a bare JPEG.",
                }),
                "label": ("STRING", {
                    "default": "",
                    "tooltip": "Value substituted for %label% in filename_prefix. Sanitised: "
                               "path separators, traversal ('../', 'a/b', 'C:\\') and leading "
                               "dots are stripped before it is used.",
                }),
                "quality": ("INT", {
                    "default": 90, "min": 1, "max": 100, "step": 1,
                    "tooltip": "JPEG quality. Ignored for PNG.",
                }),
                "preview": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Show the saved images in the node's preview. Turning this off "
                               "saves the files without sending them back to the UI.",
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
                "dynprompt": "DYNPROMPT",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("parameters",)
    OUTPUT_TOOLTIPS = ("The A1111 parameters text written into the file "
                       "(empty in *_with_no_meta modes).",)
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "image"
    DESCRIPTION = ("Saves images with A1111-style 'parameters' metadata that Civitai reads: "
                   "prompt, negative prompt, seed, steps, sampler, scheduler, CFG, size, model "
                   "and LoRA hashes, hires pass. PNG, JPEG, or no metadata at all. No rewiring: "
                   "swap it in for Save Image.")
    SEARCH_ALIASES = ["civitai", "civitai metadata", "a1111 metadata",
                      "save with metadata", "metadata", "save jpeg"]

    # ------------------------------------------------------------------ label helpers
    @staticmethod
    def _sanitize_label(value):
        """Turn a user-supplied label into a single, safe filename component.

        The label ends up inside ``filename_prefix``, which ComfyUI later turns into a
        path, so anything that looks like a path is reduced to its final segment
        (``../../etc/passwd`` -> ``passwd``, ``a/b/c`` -> ``c``, ``C:\\x`` -> ``x``).
        Leading dots are dropped so ``..`` and hidden files cannot survive. Everything
        outside a small filename whitelist becomes ``_``. There is no eval/shell in this
        code path, so the string is never interpreted as anything but a filename.
        """
        if not value:
            return ""
        # Strip control characters and null bytes first; keep ordinary spaces and tabs.
        text = "".join(ch for ch in str(value) if ch >= " ")
        # A label is a filename component, not a path.
        text = text.replace("\\", "/").rsplit("/", 1)[-1]
        # Leading dots would create hidden files or leave a ".." component behind.
        text = text.lstrip(".")
        # Whitelist a sensible filename alphabet; anything else becomes "_".
        text = re.sub(r"[^A-Za-z0-9 _\-\.\(\)\[\]{}#@!$&'+;=]", "_", text)
        text = " ".join(text.split())
        return text[:128]

    @classmethod
    def _apply_label(cls, filename_prefix, label):
        if not filename_prefix or "%label%" not in filename_prefix:
            return filename_prefix
        return filename_prefix.replace("%label%", cls._sanitize_label(label))

    # ------------------------------------------------------------------ entry point
    def save_images(self, images, filename_prefix="ComfyUI", file_format="PNG_with_workflow",
                    label="", quality=90, preview=True,
                    prompt=None, extra_pnginfo=None, unique_id=None, dynprompt=None):
        height, width = int(images[0].shape[0]), int(images[0].shape[1])

        is_jpg = file_format in JPG_FORMATS
        wants_parameters = file_format in ("PNG_with_workflow", "PNG_only_parameters",
                                           "JPG_only_parameters")
        wants_workflow = file_format == "PNG_with_workflow"

        # Only pay for the graph trace when the chosen mode actually writes parameters.
        parameters = ""
        if wants_parameters:
            try:
                parameters = self._build(unique_id, dynprompt, prompt, width, height)
            except Exception:
                log.exception("[Civitai Metadata] could not build parameters for node %s; "
                              "saving without them", unique_id)

        prefix = self._apply_label(filename_prefix, label)
        full_output_folder, filename, counter, subfolder, filename_prefix = \
            folder_paths.get_save_image_path(prefix, self.output_dir, width, height)

        ext = ".jpg" if is_jpg else ".png"
        results = []
        for batch_number, image in enumerate(images):
            array = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))
            file = f"{filename.replace('%batch_num%', str(batch_number))}_{counter:05}_{ext}"
            path = os.path.join(full_output_folder, file)

            if is_jpg:
                _save_jpeg(img, path, parameters if wants_parameters else None, quality)
            else:
                metadata = PngInfo()
                if wants_parameters and parameters:
                    # Always UTF-8 iTXt: a latin-1 tEXt chunk gets its accents misread.
                    metadata.add_itxt("parameters", parameters)
                if wants_workflow and not args.disable_metadata:
                    if prompt is not None:
                        metadata.add_text("prompt", json.dumps(prompt))
                    if extra_pnginfo is not None:
                        for key in extra_pnginfo:
                            metadata.add_text(key, json.dumps(extra_pnginfo[key]))
                img.save(path, pnginfo=metadata, compress_level=self.compress_level)

            results.append({"filename": file, "subfolder": subfolder, "type": self.type})
            counter += 1

        out = {"result": (parameters,)}
        if preview:
            out["ui"] = {"images": results}
        return out

    # ------------------------------------------------------------------ graph trace

    @staticmethod
    def _build(unique_id, dynprompt, prompt, width, height):
        if unique_id is None:
            return ""
        adapter = _ComfyAdapter(dynprompt, prompt)
        graph = Graph(adapter.get_node, adapter.get_runtime, adapter.get_class, adapter.find_file)
        generation = trace(graph, str(unique_id))
        if generation is None:
            log.warning("[Civitai Metadata] node %s: no sampler found upstream of the images - "
                        "saved without Civitai parameters", unique_id)
            return ""
        parameters = build_parameters(generation, width, height, adapter.resource_info)

        base = generation.base
        loras = len({lora.filename.lower() for p in generation.passes for lora in p.loras})
        summary = [
            f"model {base.model.name if base.model else '?'}",
            f"seed {base.seed}",
            f"{base.steps} steps",
            f"{sampler_label(base.sampler)}/{scheduler_label(base.scheduler)}",
            f"cfg {base.cfg:g}" if base.cfg is not None else "cfg ?",
        ]
        if len(generation.passes) > 1:
            summary.append(f"hires {generation.final.steps} steps @ {generation.final.denoise}")
        if loras:
            summary.append(f"{loras} LoRA")
        if adapter.cache is None:
            generation.warnings.append("runtime cache unavailable, linked values read statically")
        log.info("[Civitai Metadata] node %s: %s%s", unique_id, ", ".join(summary),
                 f" (warning: {'; '.join(generation.warnings)})" if generation.warnings else "")
        return parameters
