"""End-to-end live runs, offline: ``betadvisor run-daily|run-results|run-closing --offline``."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from betadvisor.cli import app
from betadvisor.ingest.api_football import ApiFootball
from betadvisor.ingest.base import MatchResult
from betadvisor.ingest.http import RecordedHttp
from betadvisor.ingest.odds_api import OddsApi
from betadvisor.publish.store import OutputStore
from betadvisor.publish.validate import schema_errors, signal_rule_errors
from betadvisor.runner import Sources, run_results
from tests.live_fixture import NOW, RECORDINGS, write_history

runner = CliRunner()
ODDS_PL = "api.the-odds-api.com_v4_sports_soccer_epl_odds"


@pytest.fixture(scope="module")
def history_csv(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return write_history(tmp_path_factory.mktemp("history") / "matches.csv")


@pytest.fixture
def recordings(tmp_path: Path) -> Path:
    dest = tmp_path / "recordings"
    shutil.copytree(RECORDINGS, dest)
    return dest


def iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def run(command: str, out: Path, recordings: Path, now: datetime, *extra: str) -> Any:
    args = [command, "--offline", "--recordings", str(recordings), "--out", str(out)]
    return runner.invoke(app, [*args, "--now", iso(now), *extra])


def daily(out: Path, recordings: Path, history: Path, now: datetime = NOW, *extra: str) -> Any:
    return run("run-daily", out, recordings, now, "--history", str(history), *extra)


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def snapshot_bytes(root: Path) -> dict[str, bytes]:
    files = sorted(p for p in root.rglob("*") if p.is_file())
    return {str(p.relative_to(root)): p.read_bytes() for p in files}


def edit_recording(recordings: Path, part: str, edit: Any) -> None:
    path = next(p for p in recordings.glob("*.json") if part in p.name)
    data = load(path)
    edit(data)
    path.write_text(json.dumps(data))


def test_run_daily_offline_produces_valid_feed(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    result = daily(out, recordings, history_csv)
    assert result.exit_code == 0, result.output
    # Simulated history against real recorded odds: the edges are large, all four pass.
    assert "recommended: 4" in result.output
    assert "odds credits used: 4" in result.output
    for kind in ("signals", "results", "meta"):
        assert schema_errors(kind, load(out / "feed" / f"{kind}.json")) == []  # type: ignore[arg-type]
    signals = load(out / "feed" / "signals.json")
    assert signal_rule_errors(signals) == []
    by_match = {s["match_id"]: s for s in signals["signals"]}
    assert set(by_match) == {
        "PL_20261109_ARS_CHE",
        "PL_20261110_LIV_MCI",
        "BL1_20261109_BAY_BVB",
        "BL1_20261110_RBL_B04",
    }  # MUN-TOT has no odds; NEW-EVE is beyond 48 h
    ars = by_match["PL_20261109_ARS_CHE"]
    assert ars["recommended"] and ars["selection"] == "HOME" and ars["version"] == 1
    assert ars["context"]["injuries_away"] == ["R. James (out)"]
    bay = by_match["BL1_20261109_BAY_BVB"]
    assert bay["context"]["availability_status"] == "unknown"
    assert {"low_data", "single_bookmaker"} <= set(bay["quality_flags"])

    meta = load(out / "feed" / "meta.json")
    assert meta["sources_health"]["odds"]["status"] == "degraded"  # MUN-TOT
    assert meta["sources_health"]["injuries"]["status"] == "degraded"
    results = {r["match_id"]: r for r in load(out / "feed" / "results.json")["results"]}
    assert results["PL_20261103_CRY_WHU"]["status"] == "POSTPONED"
    assert results["BL1_20261102_TSG_SCF"]["status"] == "ABANDONED"
    assert results["PL_20261101_AVL_BOU"]["home_goals"] == 2

    archive = out / "archive" / "2026-11-09"
    assert load(archive / "signals-060000.json") == signals
    record = load(archive / "run-060000.json")
    assert record["decision_config"]["min_edge"] == 0.04
    assert (out / "odds" / "2026-11-09" / "odds-060000.json").exists()


def test_second_run_with_changed_odds_creates_v2(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    v1_archive = out / "archive" / "2026-11-09" / "signals-060000.json"
    v1_bytes = v1_archive.read_bytes()
    v1 = {s["signal_id"]: s for s in load(v1_archive)["signals"]}

    def bump_arsenal(data: Any) -> None:
        for event in data["body"]:
            if event["home_team"] == "Arsenal":
                for book in event["bookmakers"]:
                    for o in book["markets"][0]["outcomes"]:
                        if o["name"] == "Arsenal":
                            o["price"] = round(o["price"] + 0.2, 2)

    edit_recording(recordings, ODDS_PL, bump_arsenal)
    later = NOW + timedelta(hours=1)
    result = daily(out, recordings, history_csv, later)
    assert result.exit_code == 0, result.output
    assert "new_versions: 1" in result.output

    assert v1_archive.read_bytes() == v1_bytes  # FR-D8: never rewritten
    v2_doc = load(out / "feed" / "signals.json")
    assert signal_rule_errors(v2_doc) == []
    v2 = {s["signal_id"]: s for s in v2_doc["signals"]}
    sid = "2026-11-09_PL_ARS-CHE_1X2_HOME"
    assert v2[sid]["version"] == 2
    assert v2[sid]["supersedes"] == {"version": 1, "versioned_at": iso(NOW)}
    assert v2[sid]["versioned_at"] == iso(later)
    assert v2[sid]["odds"] > v1[sid]["odds"]
    unchanged = [s for k, s in v2.items() if k != sid]
    assert unchanged and all(s == v1[s["signal_id"]] for s in unchanged)
    assert load(out / "archive" / "2026-11-09" / "signals-070000.json") == v2_doc

    # A third run with the same odds publishes no new version.
    third = daily(out, recordings, history_csv, later + timedelta(hours=1))
    assert third.exit_code == 0 and "new_versions: 0" in third.output


def test_unknown_team_fails_and_keeps_previous_output(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    before = snapshot_bytes(out)

    def rename(data: Any) -> None:
        data["body"]["matches"][0]["homeTeam"]["name"] = "Arsenal Invincibles FC"
        data["body"]["matches"][0]["homeTeam"]["shortName"] = "Invincibles"

    edit_recording(recordings, "PL_matches__dateFrom=2026-10-26_dateTo=2026-11-11", rename)
    result = daily(out, recordings, history_csv, NOW + timedelta(hours=1))
    assert result.exit_code != 0
    assert "Arsenal Invincibles FC" in result.output
    assert snapshot_bytes(out) == before


def test_quota_guard_fails_run_and_keeps_previous_output(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    before = snapshot_bytes(out)

    def low_quota(data: Any) -> None:
        data["headers"]["x-requests-remaining"] = "50"

    edit_recording(recordings, ODDS_PL, low_quota)
    result = daily(out, recordings, history_csv, NOW + timedelta(hours=1))
    assert result.exit_code != 0
    assert "reserve is 50" in result.output
    assert snapshot_bytes(out) == before


def test_dry_run_writes_nothing(tmp_path: Path, recordings: Path, history_csv: Path) -> None:
    out = tmp_path / "out"
    result = daily(out, recordings, history_csv, NOW, "--dry-run")
    assert result.exit_code == 0, result.output
    assert "(dry run)" in result.output
    assert not out.exists()


def test_same_second_rerun_refuses_to_rewrite_archive(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    before = snapshot_bytes(out)
    result = daily(out, recordings, history_csv)
    assert result.exit_code != 0 and "never rewritten" in result.output
    assert snapshot_bytes(out) == before


def test_carried_signals_stay_after_kickoff(
    tmp_path: Path, recordings: Path, history_csv: Path
) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    # 21:00Z: ARS-CHE (20:00) and BAY-BVB (18:30) have kicked off and are no longer fixtures.
    later = datetime(2026, 11, 9, 21, tzinfo=UTC)
    assert daily(out, recordings, history_csv, later).exit_code == 0
    ids = {s["match_id"] for s in load(out / "feed" / "signals.json")["signals"]}
    assert {"PL_20261109_ARS_CHE", "BL1_20261109_BAY_BVB"} <= ids


@dataclass
class StubResults:
    results_list: list[MatchResult]

    def results(self, date_from: date, date_to: date) -> list[MatchResult]:
        return self.results_list


def test_closing_snapshot_feeds_results(tmp_path: Path, recordings: Path) -> None:
    out = tmp_path / "out"
    closing_at = datetime(2026, 11, 9, 19, tzinfo=UTC)  # 1 h before ARS-CHE
    result = run("run-closing", out, recordings, closing_at)
    assert result.exit_code == 0, result.output
    snap = load(out / "odds" / "2026-11-09" / "odds-190000.json")
    assert [m["match_id"] for m in snap["matches"]][0] == "PL_20261109_ARS_CHE"
    assert not (out / "feed").exists()  # closing runs only snapshot

    kickoff = datetime(2026, 11, 9, 20, tzinfo=UTC)
    finished = MatchResult("PL", "ARS", "CHE", kickoff, "finished", 2, 1)
    sources = Sources(
        fixtures=StubResults([finished]),  # type: ignore[arg-type]
        odds=OddsApi(RecordedHttp(recordings), "k", closing_at),
        injuries=ApiFootball(RecordedHttp(recordings), None),
        history=lambda: pytest.fail("results run must not load history"),
    )
    report = run_results(sources, OutputStore(out), datetime(2026, 11, 10, 6, tzinfo=UTC))
    assert report.counts == {"results": 1, "with_closing_odds": 1}
    (entry,) = load(out / "feed" / "results.json")["results"]
    pl_odds = {m["match_id"]: m for m in snap["matches"]}["PL_20261109_ARS_CHE"]
    assert entry["closing_odds"] == {k: pl_odds[k] for k in ("HOME", "DRAW", "AWAY")}
    meta = load(out / "feed" / "meta.json")
    assert schema_errors("meta", meta) == []
    assert meta["sources_health"]["results"]["status"] == "ok"
    assert meta["sources_health"]["odds"]["status"] == "disabled"  # no daily run yet


def test_run_results_offline_cli(tmp_path: Path, recordings: Path, history_csv: Path) -> None:
    out = tmp_path / "out"
    assert daily(out, recordings, history_csv).exit_code == 0
    signals_before = (out / "feed" / "signals.json").read_bytes()
    result = run("run-results", out, recordings, NOW + timedelta(minutes=5))
    assert result.exit_code == 0, result.output
    assert "results: 5" in result.output
    assert (out / "feed" / "signals.json").read_bytes() == signals_before
    meta = load(out / "feed" / "meta.json")
    assert meta["sources_health"]["odds"]["status"] == "degraded"  # kept from run-daily
