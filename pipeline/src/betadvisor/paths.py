"""Filesystem locations used by the pipeline."""

from __future__ import annotations

import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[2]


def cache_dir() -> Path:
    """``$BETADVISOR_CACHE`` if set, else ``pipeline/.cache`` (git-ignored)."""
    override = os.environ.get("BETADVISOR_CACHE")
    return Path(override) if override else PIPELINE_DIR / ".cache"


def history_dir() -> Path:
    return cache_dir() / "history"
