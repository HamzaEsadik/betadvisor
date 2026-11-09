"""``betadvisor validate`` and ``betadvisor heartbeat`` used by the publishing workflow."""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import pytest
from typer.testing import CliRunner

from betadvisor.cli import app
from betadvisor.errors import FeedValidationError
from betadvisor.publish.health import health_errors, record_success, validate_published

REPO = Path(__file__).resolve().parents[3]
SAMPLE = REPO / "feed-samples" / "day1-normal"
runner = CliRunner()


@pytest.fixture
def site(tmp_path: Path) -> Path:
    feed = tmp_path / "feed"
    feed.mkdir()
    for kind in ("signals", "results", "meta"):
        shutil.copy(SAMPLE / f"{kind}.json", feed / f"{kind}.json")
    return tmp_path


def test_valid_feed_passes(site: Path) -> None:
    assert validate_published(site) == []
    result = runner.invoke(app, ["validate", "--out", str(site)])
    assert result.exit_code == 0, result.output
    assert "all files valid" in result.output


def test_missing_file_fails(site: Path) -> None:
    (site / "feed" / "results.json").unlink()
    problems = validate_published(site)
    assert len(problems) == 1 and "results.json: missing" in problems[0]
    assert runner.invoke(app, ["validate", "--out", str(site)]).exit_code == 1


def test_broken_json_and_schema_violation_fail(site: Path) -> None:
    (site / "feed" / "meta.json").write_text("{not json", encoding="utf-8")
    signals = json.loads((site / "feed" / "signals.json").read_text(encoding="utf-8"))
    signals["unexpected"] = True
    (site / "feed" / "signals.json").write_text(json.dumps(signals), encoding="utf-8")
    problems = validate_published(site)
    assert len(problems) == 2
    assert any("signals.json" in p for p in problems)
    assert any("meta.json" in p for p in problems)


def test_heartbeat_keeps_other_jobs(site: Path) -> None:
    first = datetime(2026, 11, 9, 6, 0, 5, tzinfo=UTC)
    record_success(site, "daily", first, "https://github.com/o/r/actions/runs/1")
    result = runner.invoke(
        app, ["heartbeat", "results", "--out", str(site), "--now", "2026-11-09T09:00:00Z"]
    )
    assert result.exit_code == 0, result.output
    doc = json.loads((site / "feed" / "health.json").read_text(encoding="utf-8"))
    assert health_errors(doc) == []
    assert doc["updated_at"] == "2026-11-09T09:00:00Z"
    assert doc["jobs"] == {
        "daily": {
            "last_success_at": "2026-11-09T06:00:05Z",
            "run_url": "https://github.com/o/r/actions/runs/1",
        },
        "results": {"last_success_at": "2026-11-09T09:00:00Z", "run_url": None},
    }
    assert validate_published(site) == []
    assert not list((site / "feed").glob(".health-*"))


def test_heartbeat_rejects_unknown_job(site: Path) -> None:
    result = runner.invoke(app, ["heartbeat", "weekly", "--out", str(site)])
    assert result.exit_code != 0
    assert not (site / "feed" / "health.json").exists()
    with pytest.raises(ValueError):
        record_success(site, "weekly", datetime.now(UTC), None)  # type: ignore[arg-type]


def test_heartbeat_refuses_corrupt_health(site: Path) -> None:
    path = site / "feed" / "health.json"
    path.write_text('{"schema_version": 2}', encoding="utf-8")
    with pytest.raises(FeedValidationError):
        record_success(site, "daily", datetime.now(UTC), None)
    assert runner.invoke(app, ["heartbeat", "daily", "--out", str(site)]).exit_code == 1
    assert validate_published(site)  # the corrupt heartbeat is reported too
    assert path.read_text(encoding="utf-8") == '{"schema_version": 2}'
