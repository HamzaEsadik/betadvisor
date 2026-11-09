"""Feed validation before anything is written: JSON Schema plus cross-field rules (FR-D7)."""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any, Literal

from jsonschema import Draft202012Validator

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.errors import FeedValidationError
from betadvisor.paths import PIPELINE_DIR

FeedKind = Literal["signals", "results", "meta"]
SCHEMA_DIR = PIPELINE_DIR.parent / "schemas"
TOLERANCE = 1e-6


@cache
def validator(kind: FeedKind) -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / f"{kind}.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def schema_errors(kind: FeedKind, doc: Any) -> list[str]:
    errors = sorted(validator(kind).iter_errors(doc), key=lambda e: e.json_path)
    return [f"{e.json_path}: {e.message}" for e in errors]


def signal_rule_errors(doc: dict[str, Any], config: DecisionConfig = DEFAULT_CONFIG) -> list[str]:
    """Rules ``signals.schema.json`` cannot express (see ``schemas/README.md``)."""
    errors: list[str] = []
    signals: list[dict[str, Any]] = doc["signals"]
    for sid, n in Counter(s["signal_id"] for s in signals).items():
        if n > 1:
            errors.append(f"{sid}: appears {n} times")
    for mid, n in Counter(s["match_id"] for s in signals).items():
        if n > 1:
            errors.append(f"{mid}: {n} entries for one match")
    generated = parse_ts(doc["generated_at"])
    for s in signals:
        sid = s["signal_id"]
        day = s["kickoff_at"][:10]
        expected_sid = (
            f"{day}_{s['league_code']}_{s['home_code']}-{s['away_code']}_1X2_{s['selection']}"
        )
        expected_mid = (
            f"{s['league_code']}_{day.replace('-', '')}_{s['home_code']}_{s['away_code']}"
        )
        if (sid, s["match_id"]) != (expected_sid, expected_mid):
            errors.append(f"{sid}: ids do not match their parts ({expected_sid}, {expected_mid})")
        if parse_ts(s["versioned_at"]) > generated:
            errors.append(f"{sid}: versioned_at is after generated_at")
        if parse_ts(s["odds_fetched_at"]) > generated:
            errors.append(f"{sid}: odds_fetched_at is after generated_at")
        sup = s["supersedes"]
        if sup is not None and (
            sup["version"] >= s["version"]
            or parse_ts(sup["versioned_at"]) >= parse_ts(s["versioned_at"])
        ):
            errors.append(f"{sid}: supersedes is not an earlier version")
        p, odds = s["model_prob"], s["odds"]
        if not math.isclose(s["edge"], p * odds - 1, abs_tol=TOLERANCE):
            errors.append(f"{sid}: edge {s['edge']} != model_prob x odds - 1")
        if s["recommended"]:
            f_star = (p * odds - 1) / (odds - 1)
            stake = min(config.kelly_multiplier * max(f_star, 0), config.per_bet_cap)
            if not math.isclose(s["stake_fraction"], stake, abs_tol=TOLERANCE):
                errors.append(f"{sid}: stake_fraction {s['stake_fraction']} != {stake:.6f}")
    return errors


def check(kind: FeedKind, doc: Any, config: DecisionConfig = DEFAULT_CONFIG) -> None:
    """Raise :class:`FeedValidationError` listing every problem with ``doc``."""
    errors = schema_errors(kind, doc)
    if not errors and kind == "signals":
        errors = signal_rule_errors(doc, config)
    if errors:
        shown = "\n  ".join(errors[:20])
        more = f"\n  ... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise FeedValidationError(f"{kind}.json is invalid:\n  {shown}{more}")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
