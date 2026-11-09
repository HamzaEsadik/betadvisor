"""Everything the pipeline writes under its output directory (default ``out/``).

::

    out/feed/{signals,results,meta}.json        latest feed, replaced atomically
    out/archive/<run date>/signals-HHMMSS.json  every published signals.json, never rewritten
    out/archive/<run date>/run-HHMMSS.json      run record: decision config, counts, credits
    out/odds/<run date>/odds-HHMMSS.json        consensus odds snapshots (closing odds, FR-D10)

Archive and snapshot files are created with exclusive mode, so an existing file is never
replaced (FR-D8). Feed files are written only after every file of the run has validated; each
is written to a temporary file and moved into place, so a failure leaves the previous feed
untouched (FR-D11).
"""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.errors import PipelineError
from betadvisor.publish.validate import FeedKind, check, load_json, parse_ts

FEED_FILES: tuple[FeedKind, ...] = ("signals", "results", "meta")
# Signals are published at most 48 h before kickoff, so their versions live in the archive
# folders of the last few run dates.
ARCHIVE_LOOKBACK_DAYS = 4
SNAPSHOT_LOOKBACK_DAYS = 16


def iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(doc: Any) -> str:
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def write_new(path: Path, doc: Any) -> None:
    """Create ``path``; fail if it exists (archive files are immutable)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as fh:
            fh.write(dump(doc))
    except FileExistsError:
        raise PipelineError(f"{path} already exists; archive files are never rewritten") from None


@dataclass(frozen=True)
class OutputStore:
    root: Path

    @property
    def feed_dir(self) -> Path:
        return self.root / "feed"

    @property
    def archive_dir(self) -> Path:
        return self.root / "archive"

    @property
    def odds_dir(self) -> Path:
        return self.root / "odds"

    def feed(self, kind: FeedKind) -> dict[str, Any] | None:
        """The currently published file (validated), or ``None`` before the first run."""
        path = self.feed_dir / f"{kind}.json"
        if not path.exists():
            return None
        doc = load_json(path)
        check(kind, doc)
        assert isinstance(doc, dict)
        return doc

    # -- archive -------------------------------------------------------------------------------

    def _recent_files(self, base: Path, pattern: str, now: datetime, days: int) -> list[Path]:
        today = now.astimezone(UTC).date()
        out: list[Path] = []
        for back in range(days, -1, -1):
            day_dir = base / (today - timedelta(days=back)).isoformat()
            out.extend(sorted(day_dir.glob(pattern)))
        return out

    def latest_versions(self, now: datetime) -> dict[str, dict[str, Any]]:
        """Latest archived version of every signal_id published in the last few days."""
        latest: dict[str, dict[str, Any]] = {}
        files = self._recent_files(self.archive_dir, "signals-*.json", now, ARCHIVE_LOOKBACK_DAYS)
        for path in files:
            for s in load_json(path)["signals"]:
                prev = latest.get(s["signal_id"])
                if prev is None or s["version"] >= prev["version"]:
                    latest[s["signal_id"]] = s
        return latest

    def archive_path(self, kind: str, now: datetime) -> Path:
        now = now.astimezone(UTC)
        return self.archive_dir / now.date().isoformat() / f"{kind}-{now:%H%M%S}.json"

    # -- odds snapshots ------------------------------------------------------------------------

    def snapshot_path(self, now: datetime) -> Path:
        now = now.astimezone(UTC)
        return self.odds_dir / now.date().isoformat() / f"odds-{now:%H%M%S}.json"

    def snapshots(self, now: datetime) -> list[dict[str, Any]]:
        files = self._recent_files(self.odds_dir, "odds-*.json", now, SNAPSHOT_LOOKBACK_DAYS)
        return [load_json(p) for p in files]

    # -- publishing ----------------------------------------------------------------------------

    def publish(
        self,
        feed: Mapping[FeedKind, dict[str, Any]],
        records: Mapping[Path, Any],
        config: DecisionConfig = DEFAULT_CONFIG,
    ) -> list[Path]:
        """Validate ``feed``, create the immutable ``records``, then replace the feed files."""
        for kind, doc in feed.items():
            check(kind, doc, config)
        for path in records:
            if path.exists():
                raise PipelineError(f"{path} already exists; archive files are never rewritten")
        written: list[Path] = []
        for path, doc in records.items():
            write_new(path, doc)
            written.append(path)
        if feed:
            self.feed_dir.mkdir(parents=True, exist_ok=True)
        staged: list[tuple[Path, Path]] = []
        try:
            for kind, doc in feed.items():
                fd, tmp_name = tempfile.mkstemp(
                    dir=self.feed_dir, prefix=f".{kind}-", suffix=".tmp"
                )
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    fh.write(dump(doc))
                staged.append((Path(tmp_name), self.feed_dir / f"{kind}.json"))
        except BaseException:
            for staged_tmp, _ in staged:
                staged_tmp.unlink(missing_ok=True)
            raise
        for staged_tmp, final in staged:
            os.replace(staged_tmp, final)
            written.append(final)
        return written


def closing_odds_for(
    snapshots: list[dict[str, Any]], match_id: str, kickoff_at: datetime, window: timedelta
) -> dict[str, float] | None:
    """Odds from the last snapshot taken before kickoff and at most ``window`` before it."""
    best: tuple[datetime, dict[str, float]] | None = None
    for snap in snapshots:
        taken = parse_ts(snap["taken_at"])
        if not kickoff_at - window <= taken <= kickoff_at:
            continue
        for m in snap["matches"]:
            if m["match_id"] == match_id and (best is None or taken > best[0]):
                best = (taken, {k: float(m[k]) for k in ("HOME", "DRAW", "AWAY")})
    return None if best is None else best[1]
