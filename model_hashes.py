#this file with minor changes from https://github.com/seesee75-commits/ComfyUI-SeeSee-Civitai-Metadata 
# Copyright (c) 2026 seesee75
"""SHA256 of model files, cached, with Civitai version ids where a sidecar knows them.

Hashing a 20 GB checkpoint takes a while, so every result is cached by path, size and
mtime. Before hashing, sidecar files written by other tools are checked:

* ``<model>.metadata.json``  - LoRA Manager (``sha256``, and ``civitai.id`` when the file
  came from Civitai)
* ``<model>.civitai.info``   - Civitai Helper (``id`` and ``files[].hashes.SHA256``)
* ``<model>.sha256``         - plain hash file
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time

log = logging.getLogger("DA_SaveImage")

HEX64 = re.compile(r"\b([0-9a-fA-F]{64})\b")


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


class HashStore:
    def __init__(self, cache_path):
        self.cache_path = cache_path
        self._lock = threading.Lock()
        self._data = None

    def _load(self):
        if self._data is None:
            data = _read_json(self.cache_path)
            self._data = data if isinstance(data, dict) else {}
        return self._data

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
            tmp = self.cache_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(self._data, handle, indent=1, sort_keys=True)
            os.replace(tmp, self.cache_path)
        except Exception as exc:
            log.warning("[Civitai Metadata] could not write hash cache %s: %s", self.cache_path, exc)

    def info(self, full_path):
        """Return (sha256 or None, civitai_version_id or None) for a model file."""
        if not full_path or not os.path.isfile(full_path):
            return None, None
        with self._lock:
            stat = os.stat(full_path)
            key = os.path.normcase(os.path.abspath(full_path))
            data = self._load()
            entry = data.get(key)
            if entry and entry.get("size") == stat.st_size and entry.get("mtime") == int(stat.st_mtime):
                if entry.get("sha256"):
                    return entry["sha256"], entry.get("civitai_version_id")

            sha, version_id = self._from_sidecars(full_path, stat.st_size)
            if not sha:
                sha = self._compute(full_path, stat.st_size)
            if sha:
                data[key] = {
                    "size": stat.st_size,
                    "mtime": int(stat.st_mtime),
                    "sha256": sha,
                    "civitai_version_id": version_id,
                }
                self._save()
            return sha, version_id

    @staticmethod
    def _from_sidecars(full_path, size):
        stem, _ = os.path.splitext(full_path)
        sha = None
        version_id = None

        meta = _read_json(stem + ".metadata.json")
        if isinstance(meta, dict):
            meta_size = meta.get("size")
            if meta_size in (None, size) and isinstance(meta.get("sha256"), str) and HEX64.fullmatch(meta["sha256"]):
                sha = meta["sha256"].lower()
                civitai = meta.get("civitai")
                if isinstance(civitai, dict) and isinstance(civitai.get("id"), int):
                    version_id = civitai["id"]

        info = _read_json(stem + ".civitai.info")
        if isinstance(info, dict):
            for file_entry in info.get("files") or []:
                hashes = (file_entry or {}).get("hashes") or {}
                candidate = hashes.get("SHA256")
                if isinstance(candidate, str) and HEX64.fullmatch(candidate):
                    if sha is None or sha == candidate.lower():
                        sha = candidate.lower()
                        if isinstance(info.get("id"), int):
                            version_id = version_id or info["id"]
                        break

        if sha is None:
            for candidate_path in (full_path + ".sha256", stem + ".sha256"):
                try:
                    with open(candidate_path, "r", encoding="utf-8") as handle:
                        match = HEX64.search(handle.read(512))
                    if match:
                        sha = match.group(1).lower()
                        break
                except Exception:
                    continue
        return sha, version_id

    @staticmethod
    def _compute(full_path, size):
        started = time.time()
        log.info("[Civitai Metadata] hashing %s (%.1f GB) - only the first time, the result is cached",
                    os.path.basename(full_path), size / 1024 ** 3)
        digest = hashlib.sha256()
        try:
            with open(full_path, "rb") as handle:
                while True:
                    chunk = handle.read(16 * 1024 * 1024)
                    if not chunk:
                        break
                    digest.update(chunk)
        except Exception as exc:
            log.warning("[Civitai Metadata] could not hash %s: %s", full_path, exc)
            return None
        log.info("[Civitai Metadata] hashed %s in %.1fs", os.path.basename(full_path), time.time() - started)
        return digest.hexdigest()
