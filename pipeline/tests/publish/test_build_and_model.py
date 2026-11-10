"""Versioning, feed window, results and the live model (no network, no files)."""

from __future__ import annotations

import dataclasses
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd
import pytest

from betadvisor.errors import FeedValidationError
from betadvisor.ingest.base import MatchResult
from betadvisor.models.live import LiveModel, current_forms, merge_recent_results
from betadvisor.publish.build import apply_versions, merge_feed, results_doc
from betadvisor.publish.store import closing_odds_for
from betadvisor.publish.validate import check
from tests.live_fixture import NOW, live_history

T0 = "2026-11-09T06:00:00Z"


def entry(sid: str = "S", odds: float = 2.1, versioned_at: str = T0, **kw: Any) -> dict[str, Any]:
    return {
        "signal_id": sid,
        "match_id": kw.pop("match_id", "M"),
        "kickoff_at": kw.pop("kickoff_at", "2026-11-09T20:00:00Z"),
        "odds": odds,
        "odds_fetched_at": versioned_at,
        "version": kw.pop("version", 1),
        "versioned_at": versioned_at,
        "supersedes": kw.pop("supersedes", None),
        **kw,
    }


def test_apply_versions_new_same_and_changed() -> None:
    later = NOW + timedelta(hours=2)
    prev = {"S": entry(), "T": entry("T")}
    fresh = [entry(odds=2.2, versioned_at="2026-11-09T08:00:00Z"), entry("T"), entry("U")]
    fresh[1]["odds_fetched_at"] = "2026-11-09T08:00:00Z"  # refetched, same prices
    out, changed = apply_versions(fresh, prev, later)
    assert changed == 2
    assert out[0]["version"] == 2
    assert out[0]["supersedes"] == {"version": 1, "versioned_at": T0}
    assert out[0]["versioned_at"] == "2026-11-09T08:00:00Z"
    assert out[1] == prev["T"]  # unchanged: the published version as is
    assert out[2]["version"] == 1


def test_apply_versions_refuses_time_travel() -> None:
    with pytest.raises(ValueError, match="not older"):
        apply_versions([entry(odds=3.0)], {"S": entry()}, NOW)


def test_merge_feed_keeps_window_and_prefers_fresh() -> None:
    previous = {
        "signals": [
            entry("OLD", match_id="A", kickoff_at="2026-11-07T20:00:00Z"),  # > 24 h ago
            entry("KEEP", match_id="B", kickoff_at="2026-11-08T20:00:00Z"),
            entry("REPLACED", match_id="C"),
        ]
    }
    fresh = [entry("NEW", match_id="C")]
    out = merge_feed(fresh, previous, NOW)
    assert [s["signal_id"] for s in out] == ["KEEP", "NEW"]


def test_closing_odds_window() -> None:
    kickoff = datetime(2026, 11, 9, 20, tzinfo=UTC)
    snap = lambda taken, h: {  # noqa: E731
        "taken_at": taken,
        "matches": [{"match_id": "M", "HOME": h, "DRAW": 3.4, "AWAY": 3.9}],
    }
    snaps = [
        snap("2026-11-09T06:00:00Z", 2.0),  # morning: outside the 3 h window
        snap("2026-11-09T18:00:00Z", 2.1),
        snap("2026-11-09T19:30:00Z", 2.2),
        snap("2026-11-09T20:30:00Z", 2.3),  # after kickoff
    ]
    window = timedelta(hours=3)
    assert closing_odds_for(snaps, "M", kickoff, window) == {"HOME": 2.2, "DRAW": 3.4, "AWAY": 3.9}
    assert closing_odds_for(snaps[:1], "M", kickoff, window) is None


def test_results_doc_window_and_void_scores() -> None:
    def r(days_ago: float, status: str, goals: int | None) -> MatchResult:
        return MatchResult(
            "PL",
            "ARS",
            "CHE",
            NOW - timedelta(days=days_ago),
            status,
            goals,
            goals,  # type: ignore[arg-type]
        )

    doc = results_doc([r(15, "finished", 1), r(2, "postponed", None), r(1, "finished", 0)], [], NOW)
    check("results", doc)
    assert [x["status"] for x in doc["results"]] == ["POSTPONED", "FINISHED"]


def test_check_reports_cross_field_errors() -> None:
    doc = {"schema_version": 1, "generated_at": T0, "results": [{"match_id": "bad"}]}
    with pytest.raises(FeedValidationError, match="results.json is invalid"):
        check("results", doc)


@pytest.fixture(scope="module")
def history() -> pd.DataFrame:
    return live_history()


def test_live_model_predicts_normalized_probs(history: pd.DataFrame) -> None:
    model = LiveModel.fit(history, before=date(2026, 11, 10))
    pred = model.predict("PL", "ARS", "CHE")
    assert pred is not None and pred.dc_used and pred.stack_used
    assert model.version == "dc-elo-sot-0.2.0"
    assert sum(pred.probs.values()) == pytest.approx(1, abs=1e-12)
    assert all(0 < p < 1 for p in pred.probs.values())
    assert model.predict("PL", "ARS", "XYZ") is None
    assert model.predict("PD", "ARS", "CHE") is None  # no La Liga history
    assert len(model.form("ARS")) == 5


def test_live_model_without_shot_data_keeps_the_blend(history: pd.DataFrame) -> None:
    model = LiveModel.fit(history, before=date(2026, 11, 10))
    shots = {team: rate for team, rate in model.shots.items() if team != "ARS"}
    no_shots = dataclasses.replace(model, shots=shots)
    pred = no_shots.predict("PL", "ARS", "CHE")
    assert pred is not None and pred.dc_used and not pred.stack_used
    assert sum(pred.probs.values()) == pytest.approx(1, abs=1e-12)
    assert pred.probs != model.predict("PL", "ARS", "CHE").probs  # type: ignore[union-attr]


def test_live_model_fails_loudly_with_too_little_history(history: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="training rows"):
        LiveModel.fit(history, before=date(2025, 1, 1))


def test_live_model_ignores_matches_on_or_after_cutoff(history: pd.DataFrame) -> None:
    cutoff = date(2026, 3, 1)
    a = LiveModel.fit(history, before=cutoff)
    b = LiveModel.fit(history[history["date"] < pd.Timestamp(cutoff)], before=cutoff)
    assert a.predict("PL", "ARS", "CHE") == b.predict("PL", "ARS", "CHE")


def test_merge_recent_results_adds_only_new_matches(history: pd.DataFrame) -> None:
    last = history.iloc[-1]
    dup = MatchResult(
        last["league"],
        last["home_code"],
        last["away_code"],
        datetime.combine(last["date"].date(), datetime.min.time(), UTC) + timedelta(days=1),
        "finished",
        9,
        9,
    )
    new = MatchResult("PL", "ARS", "CHE", NOW - timedelta(days=3), "finished", 3, 0)
    postponed = MatchResult("PL", "LIV", "MCI", NOW - timedelta(days=2), "postponed", None, None)
    merged = merge_recent_results(history, [dup, new, postponed])
    assert len(merged) == len(history) + 1
    added = merged.iloc[-1]
    assert (added["season"], added["home_code"], added["home_goals"]) == ("2026-27", "ARS", 3)


def test_current_forms_newest_on_the_right() -> None:
    frame = pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-08", "2026-01-15"]),
            "league": "PL",
            "home_code": ["ARS", "CHE", "ARS"],
            "away_code": ["CHE", "ARS", "LIV"],
            "home_goals": [1, 0, 0],
            "away_goals": [0, 0, 2],
        }
    )
    forms = current_forms(frame)
    assert forms["ARS"] == "WDL"
    assert forms["CHE"] == "LD"
