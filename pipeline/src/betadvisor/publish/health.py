"""Checks used by the scheduled publishing jobs (Part 6).

``validate_published`` re-reads the feed files from disk before they are pushed, and
``record_success`` updates the ``feed/health.json`` heartbeat with the last success per job.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any, Literal, get_args

from jsonschema import Draft202012Validator

from betadvisor.errors import FeedValidationError
from betadvisor.publish.store import FEED_FILES, dump, iso
from betadvisor.publish.validate import SCHEMA_DIR, check, load_json

Job = Literal["daily", "closing", "results"]
JOBS: tuple[Job, ...] = get_args(Job)
HEALTH_FILE = "health.json"


@cache
def _health_validator() -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / "health.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def health_errors(doc: Any) -> list[str]:
    errors = sorted(_health_validator().iter_errors(doc), key=lambda e: e.json_path)
    return [f"{e.json_path}: {e.message}" for e in errors]


def validate_published(root: Path) -> list[str]:
    """Problems with ``root/feed``; an empty list means every file is present and valid."""
    feed_dir = root / "feed"
    problems: list[str] = []
    for kind in FEED_FILES:
        path = feed_dir / f"{kind}.json"
        if not path.exists():
            problems.append(f"{path}: missing")
            continue
        try:
            check(kind, load_json(path))
        except (FeedValidationError, json.JSONDecodeError) as exc:
            problems.append(f"{path}: {exc}")
    health = feed_dir / HEALTH_FILE
    if health.exists():
        try:
            problems.extend(f"{health}: {e}" for e in health_errors(load_json(health)))
        except json.JSONDecodeError as exc:
            problems.append(f"{health}: {exc}")
    return problems


def record_success(root: Path, job: Job, now: datetime, run_url: str | None) -> dict[str, Any]:
    """Set ``jobs[job]`` in ``root/feed/health.json`` and write it atomically."""
    if job not in JOBS:
        raise ValueError(f"unknown job {job!r}; expected one of {JOBS}")
    feed_dir = root / "feed"
    path = feed_dir / HEALTH_FILE
    jobs: dict[str, Any] = {}
    if path.exists():
        previous = load_json(path)
        errors = health_errors(previous)
        if errors:
            raise FeedValidationError(f"{path} is invalid:\n  " + "\n  ".join(errors))
        jobs = dict(previous["jobs"])
    jobs[job] = {"last_success_at": iso(now), "run_url": run_url}
    doc = {"schema_version": 1, "updated_at": iso(now), "jobs": dict(sorted(jobs.items()))}
    errors = health_errors(doc)
    if errors:
        raise FeedValidationError("health.json is invalid:\n  " + "\n  ".join(errors))
    feed_dir.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=feed_dir, prefix=".health-", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(dump(doc))
    os.replace(tmp, path)
    return doc
