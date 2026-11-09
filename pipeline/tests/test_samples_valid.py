"""Validate the shared feed samples against the JSON Schemas (Part 1).

Good scenarios must validate and satisfy the cross-field rules a schema cannot express.
Every file in ``feed-samples/malformed`` must fail, at the JSON path listed in the manifest
(``null`` means the file is not valid JSON at all).
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / "schemas"
SAMPLES = ROOT / "feed-samples"
MANIFEST: dict[str, Any] = json.loads((SAMPLES / "manifest.json").read_text())
KINDS = ("signals", "results", "meta")

# SRS 6.3 defaults, used to check the sample numbers are self-consistent.
KELLY_MULTIPLIER = 0.25
PER_BET_CAP = 0.05


def kind_of(path: Path) -> str:
    """`signals.json`, `signals.v2.json` and `signals-bad-form.json` are all signals files."""
    kind = path.name.split(".")[0].split("-")[0]
    assert kind in KINDS, f"cannot tell which schema applies to {path.name}"
    return kind


@cache
def validator(kind: str) -> Draft202012Validator:
    schema = json.loads((SCHEMAS / f"{kind}.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def good_files() -> list[Path]:
    return sorted(p for name in MANIFEST["scenarios"] for p in (SAMPLES / name).glob("*.json"))


def utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_manifest_lists_every_scenario_dir() -> None:
    dirs = {p.name for p in SAMPLES.iterdir() if p.is_dir()}
    assert dirs == set(MANIFEST["scenarios"]) | {"malformed"}


@pytest.mark.parametrize("name", list(MANIFEST["scenarios"]))
def test_scenario_has_every_kind(name: str) -> None:
    kinds = Counter(kind_of(p) for p in (SAMPLES / name).glob("*.json"))
    assert set(kinds) == set(KINDS)
    assert kinds["results"] == kinds["meta"] == 1


@pytest.mark.parametrize("kind", KINDS)
def test_schema_is_valid_draft_2020_12(kind: str) -> None:
    validator(kind)


@pytest.mark.parametrize("path", good_files(), ids=lambda p: f"{p.parent.name}/{p.name}")
def test_good_sample_validates(path: Path) -> None:
    errors = [e.message for e in validator(kind_of(path)).iter_errors(load(path))]
    assert errors == []


@pytest.mark.parametrize(
    "path",
    [p for p in good_files() if kind_of(p) == "signals"],
    ids=lambda p: f"{p.parent.name}/{p.name}",
)
def test_signals_cross_field_rules(path: Path) -> None:
    doc = load(path)
    signals: list[dict[str, Any]] = doc["signals"]
    ids = [s["signal_id"] for s in signals]
    assert len(ids) == len(set(ids)), "a signal_id appears twice"
    recommended_per_match = Counter(s["match_id"] for s in signals if s["recommended"])
    assert all(n == 1 for n in recommended_per_match.values()), "SRS 9.6"

    for s in signals:
        date = s["kickoff_at"][:10]
        ids_from_parts = (
            f"{date}_{s['league_code']}_{s['home_code']}-{s['away_code']}_1X2_{s['selection']}",
            f"{s['league_code']}_{date.replace('-', '')}_{s['home_code']}_{s['away_code']}",
        )
        assert (s["signal_id"], s["match_id"]) == ids_from_parts
        assert utc(s["versioned_at"]) <= utc(doc["generated_at"])
        assert utc(s["odds_fetched_at"]) <= utc(doc["generated_at"])
        if s["supersedes"] is not None:
            assert s["supersedes"]["version"] < s["version"]
            assert utc(s["supersedes"]["versioned_at"]) < utc(s["versioned_at"])

        odds, prob = s["odds"], s["model_prob"]
        assert s["edge"] == pytest.approx(prob * odds - 1, abs=1e-6), "SRS 6.2"
        if s["recommended"]:
            f_star = (prob * odds - 1) / (odds - 1)
            expected = min(KELLY_MULTIPLIER * max(f_star, 0), PER_BET_CAP)
            assert s["stake_fraction"] == pytest.approx(expected, abs=1e-6), "SRS 6.3"


def test_day1_normal_matches_design_02() -> None:
    signals = load(SAMPLES / "day1-normal" / "signals.json")["signals"]
    today = [s for s in signals if s["kickoff_at"].startswith("2026-11-09")]
    stakes = [round(107.20 * s["stake_fraction"], 2) for s in today if s["recommended"]]
    assert sorted(stakes) == [1.12, 1.67, 2.24]
    assert round(sum(stakes), 2) == 5.03
    reasons = {s["skip_reason"] for s in today if not s["recommended"]}
    schema = json.loads((SCHEMAS / "signals.schema.json").read_text())
    skip_enum = schema["$defs"]["signal"]["properties"]["skip_reason"]
    assert reasons == set(skip_enum["oneOf"][1]["enum"])


def test_day1_results_cover_win_loss_void() -> None:
    signals = {s["match_id"]: s for s in load(SAMPLES / "day1-results" / "signals.json")["signals"]}
    results = load(SAMPLES / "day1-results" / "results.json")["results"]
    outcomes = []
    for r in results:
        bet = signals[r["match_id"]]
        if not bet["recommended"]:
            continue
        if r["status"] != "FINISHED":
            outcomes.append("void")
            continue
        diff = r["home_goals"] - r["away_goals"]
        actual = "HOME" if diff > 0 else "AWAY" if diff < 0 else "DRAW"
        outcomes.append("won" if actual == bet["selection"] else "lost")
    assert sorted(outcomes) == ["lost", "void", "won"]


def test_stale_is_26_hours_old() -> None:
    generated = utc(load(SAMPLES / "stale" / "meta.json")["generated_at"])
    now = utc(MANIFEST["scenarios"]["stale"]["reference_now"])
    assert (now - generated).total_seconds() == 26 * 3600


def test_versioned_v2_supersedes_v1() -> None:
    v1 = load(SAMPLES / "versioned" / "signals.v1.json")
    v2 = load(SAMPLES / "versioned" / "signals.v2.json")
    old = {s["signal_id"]: s for s in v1["signals"]}
    changed = [s for s in v2["signals"] if s["version"] > 1]
    assert len(changed) == 1
    new = changed[0]
    prev = old[new["signal_id"]]
    assert new["supersedes"] == {"version": prev["version"], "versioned_at": prev["versioned_at"]}
    assert new["odds"] != prev["odds"]
    unchanged = [s for s in v2["signals"] if s["version"] == 1]
    assert unchanged and all(s == old[s["signal_id"]] for s in unchanged)


def test_malformed_manifest_lists_every_file() -> None:
    files = {p.name for p in (SAMPLES / "malformed").glob("*.json")}
    assert files == set(MANIFEST["malformed"])


@pytest.mark.parametrize("name", sorted(MANIFEST["malformed"]))
def test_malformed_sample_fails(name: str) -> None:
    path = SAMPLES / "malformed" / name
    expected_path: str | None = MANIFEST["malformed"][name]
    if expected_path is None:
        with pytest.raises(json.JSONDecodeError):
            load(path)
        return
    errors = list(validator(kind_of(path)).iter_errors(load(path)))
    assert errors, f"{name} should be invalid"
    paths = {e.json_path for e in errors}
    assert expected_path in paths, f"{name} failed at {paths}, expected {expected_path}"
