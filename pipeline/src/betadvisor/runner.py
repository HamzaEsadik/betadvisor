"""The three scheduled runs: ``run-daily``, ``run-results`` and ``run-closing``.

Each run gathers everything first, builds and validates every output, and only then writes
(FR-D11). Any source or validation error propagates as an exception, the CLI exits non-zero,
and the published files stay as they were.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.decision.filters import QualityFlag
from betadvisor.decision.select import MatchInput, select_match
from betadvisor.ingest.api_football import ApiFootball
from betadvisor.ingest.base import Fixture, MatchResult, TeamAvailability
from betadvisor.ingest.football_data_org import FootballDataOrg
from betadvisor.ingest.odds_api import MatchOdds, OddsApi, consensus_odds
from betadvisor.models.blend import MODEL_VERSION
from betadvisor.models.live import LiveModel, merge_recent_results
from betadvisor.publish.build import (
    RESULTS_WINDOW,
    SIGNAL_WINDOW_AHEAD,
    Health,
    MatchContext,
    apply_versions,
    match_id,
    merge_feed,
    meta_doc,
    results_doc,
    signal_entry,
    signals_doc,
)
from betadvisor.publish.store import OutputStore, iso
from betadvisor.publish.validate import check
from betadvisor.teams import TeamRegistry, default_registry

log = logging.getLogger("betadvisor.run")

FORM_FULL = 5
# Odds and fixture kickoffs from different sources must agree within this to be one match.
KICKOFF_TOLERANCE = timedelta(hours=24)
NO_SIGNALS_NOTICE = "No matches in the next 48 hours."
FEED_HEALTH_KEYS = ("fixtures", "odds", "injuries", "results")


@dataclass
class Sources:
    fixtures: FootballDataOrg
    odds: OddsApi
    injuries: ApiFootball
    history: Callable[[], pd.DataFrame]


@dataclass
class RunReport:
    command: str
    now: datetime
    dry_run: bool
    counts: dict[str, int] = field(default_factory=dict)
    dropped: list[str] = field(default_factory=list)
    written: list[Path] = field(default_factory=list)
    odds_credits_used: int = 0
    odds_remaining: int | None = None

    def record(self, config: DecisionConfig, model_version: str | None) -> dict[str, Any]:
        return {
            "command": self.command,
            "generated_at": iso(self.now),
            "model_version": model_version,
            "decision_config": config.to_dict(),
            "counts": self.counts,
            "dropped": self.dropped,
            "odds_credits_used": self.odds_credits_used,
            "odds_remaining": self.odds_remaining,
        }

    def lines(self) -> list[str]:
        out = [f"{self.command} at {iso(self.now)}{' (dry run)' if self.dry_run else ''}"]
        out += [f"  {k}: {v}" for k, v in self.counts.items()]
        out.append(f"  odds credits used: {self.odds_credits_used}")
        if self.odds_remaining is not None:
            out.append(f"  odds credits remaining: {self.odds_remaining}")
        out += [f"  dropped: {d}" for d in self.dropped]
        out += [f"  wrote {p}" for p in self.written]
        return out


def _require_utc(now: datetime) -> datetime:
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(UTC)


def _find_odds(fixture: Fixture, odds: list[MatchOdds]) -> MatchOdds | None:
    for o in odds:
        same_teams = (o.league, o.home_code, o.away_code) == (
            fixture.league,
            fixture.home_code,
            fixture.away_code,
        )
        if same_teams and abs(o.kickoff_at - fixture.kickoff_at) <= KICKOFF_TOLERANCE:
            return o
    return None


def _snapshot(odds: list[MatchOdds], now: datetime, kind: str) -> dict[str, Any]:
    upcoming = [o for o in odds if now < o.kickoff_at <= now + SIGNAL_WINDOW_AHEAD]
    return {
        "taken_at": iso(now),
        "kind": kind,
        "matches": [
            {
                "match_id": match_id(o.league, o.home_code, o.away_code, o.kickoff_at),
                "kickoff_at": iso(o.kickoff_at),
                "HOME": o.home,
                "DRAW": o.draw,
                "AWAY": o.away,
                "bookmaker": o.bookmaker,
                "n_books": o.n_books,
            }
            for o in upcoming
        ],
    }


def _odds_report(report: RunReport, sources: Sources) -> None:
    report.odds_credits_used = sources.odds.credits_used
    report.odds_remaining = sources.odds.remaining
    report.counts["odds_cache_hits"] = sources.odds.cache_hits


def _kept_health(previous: dict[str, Any] | None, key: str) -> Health | dict[str, Any]:
    if previous is not None and key in previous["sources_health"]:
        kept: dict[str, Any] = previous["sources_health"][key]
        return kept
    return Health("disabled", "not checked yet")


def run_daily(
    sources: Sources,
    store: OutputStore,
    now: datetime,
    *,
    config: DecisionConfig = DEFAULT_CONFIG,
    dry_run: bool = False,
    registry: TeamRegistry | None = None,
) -> RunReport:
    """Fixtures, odds, model and decisions -> signals.json, plus results.json and meta.json."""
    now = _require_utc(now)
    registry = registry or default_registry()
    report = RunReport("run-daily", now, dry_run)
    today = now.date()

    matches = sources.fixtures.matches(today - RESULTS_WINDOW, today + timedelta(days=2))
    fixtures = [
        m.fixture()
        for m in matches
        if m.status == "scheduled" and now < m.kickoff_at <= now + SIGNAL_WINDOW_AHEAD
    ]
    results: list[MatchResult] = [
        m.result()
        for m in matches
        if m.status in ("finished", "postponed", "cancelled", "abandoned")
    ]
    report.counts["fixtures"] = len(fixtures)

    history = merge_recent_results(sources.history(), results)
    model = LiveModel.fit(history, before=today + timedelta(days=1))

    odds = consensus_odds(sources.odds.odds())
    _odds_report(report, sources)
    priced: list[tuple[Fixture, MatchOdds]] = []
    no_odds: list[str] = []
    for f in fixtures:
        o = _find_odds(f, odds)
        if o is None:
            no_odds.append(match_id(f.league, f.home_code, f.away_code, f.kickoff_at))
        else:
            priced.append((f, o))
    report.counts["fixtures_with_odds"] = len(priced)

    injuries = sources.injuries.report([f for f, _ in priced])
    entries: list[dict[str, Any]] = []
    no_model: list[str] = []
    for f, o in priced:
        mid = match_id(f.league, f.home_code, f.away_code, f.kickoff_at)
        pred = model.predict(f.league, f.home_code, f.away_code)
        if pred is None:
            no_model.append(mid)
            continue
        home_av = injuries.teams.get(f.home_code, TeamAvailability(f.home_code, "unknown"))
        away_av = injuries.teams.get(f.away_code, TeamAvailability(f.away_code, "unknown"))
        ctx = MatchContext(
            f.league,
            f.home_code,
            f.away_code,
            f.kickoff_at,
            model.form(f.home_code),
            model.form(f.away_code),
            home_av,
            away_av,
        )
        flags: set[QualityFlag] = set()
        if "unknown" in (home_av.status, away_av.status) or not pred.dc_used:
            flags.add("low_data")
        if len(ctx.home_form) < FORM_FULL or len(ctx.away_form) < FORM_FULL:
            flags.add("form_incomplete")
        if o.n_books == 1:
            flags.add("single_bookmaker")
        decision = select_match(
            MatchInput(
                match_id=mid,
                odds={"HOME": o.home, "DRAW": o.draw, "AWAY": o.away},
                bookmaker=o.bookmaker,
                odds_fetched_at=o.fetched_at,
                model_probs=pred.probs,
                quality_flags=frozenset(flags),
            ),
            now,
            config,
        )
        entries.append(signal_entry(ctx, decision, now, registry, config))

    for mid in no_model:
        log.warning("%s: no model prediction (team without Elo history); not published", mid)
    report.dropped = [f"{m}: no odds" for m in no_odds] + [f"{m}: no model" for m in no_model]

    previous_signals = store.feed("signals")
    previous_meta = store.feed("meta")
    latest = store.latest_versions(now)
    for s in (previous_signals or {}).get("signals", []):
        if s["signal_id"] not in latest or s["version"] > latest[s["signal_id"]]["version"]:
            latest[s["signal_id"]] = s
    versioned, new_versions = apply_versions(entries, latest, now)
    signals = merge_feed(versioned, previous_signals, now)
    report.counts["signals_fresh"] = len(versioned)
    report.counts["signals_in_feed"] = len(signals)
    report.counts["recommended"] = sum(1 for s in versioned if s["recommended"])
    report.counts["new_versions"] = new_versions

    snapshot = _snapshot(odds, now, "daily")
    results_json = results_doc(results, [*store.snapshots(now), snapshot], now)
    report.counts["results"] = len(results_json["results"])

    odds_health = Health("ok")
    if no_odds:
        odds_health = Health("degraded", f"{len(no_odds)} of {len(fixtures)} fixtures have no odds")
    model_health = Health("ok")
    if no_model:
        model_health = Health("degraded", f"no prediction for {', '.join(no_model)}")
    health: dict[str, Health | dict[str, Any]] = {
        "fixtures": Health("ok", f"{len(fixtures)} fixtures in the next 48 h"),
        "odds": odds_health,
        "injuries": Health(injuries.status, injuries.detail),
        "results": Health("ok"),
        "model": model_health,
    }
    if previous_meta is not None:
        for key, value in previous_meta["sources_health"].items():
            health.setdefault(key, value)
    notice = None if signals else NO_SIGNALS_NOTICE
    feed = {
        "signals": signals_doc(signals, now, model.version),
        "results": results_json,
        "meta": meta_doc(now, model.version, health, notice),
    }
    records = {
        store.archive_path("signals", now): feed["signals"],
        store.archive_path("run", now): report.record(config, model.version),
        store.snapshot_path(now): snapshot,
    }
    return _finish(store, feed, records, report, config)


def run_results(
    sources: Sources, store: OutputStore, now: datetime, *, dry_run: bool = False
) -> RunReport:
    """Results of the last 14 days (with closing odds) -> results.json and meta.json."""
    now = _require_utc(now)
    report = RunReport("run-results", now, dry_run)
    today = now.date()
    results = sources.fixtures.results(today - RESULTS_WINDOW, today)
    results_json = results_doc(results, store.snapshots(now), now)
    report.counts["results"] = len(results_json["results"])
    report.counts["with_closing_odds"] = sum(
        1 for r in results_json["results"] if r["closing_odds"] is not None
    )

    previous_meta = store.feed("meta")
    previous_signals = store.feed("signals")
    health: dict[str, Health | dict[str, Any]] = {
        key: _kept_health(previous_meta, key) for key in FEED_HEALTH_KEYS
    }
    health["results"] = Health("ok", f"{len(results_json['results'])} results in 14 days")
    if previous_meta is not None:
        for key, value in previous_meta["sources_health"].items():
            health.setdefault(key, value)
    model_version = (previous_meta or {}).get("model_version") or MODEL_VERSION
    notice = (previous_meta or {}).get("notice")
    if previous_signals is None:
        notice = NO_SIGNALS_NOTICE
    feed = {
        "results": results_json,
        "meta": meta_doc(now, model_version, health, notice),
    }
    return _finish(store, feed, {}, report, DEFAULT_CONFIG)


def run_closing(
    sources: Sources, store: OutputStore, now: datetime, *, dry_run: bool = False
) -> RunReport:
    """Snapshot of current consensus odds; the last one before kickoff is the closing line."""
    now = _require_utc(now)
    report = RunReport("run-closing", now, dry_run)
    odds = consensus_odds(sources.odds.odds())
    _odds_report(report, sources)
    snapshot = _snapshot(odds, now, "closing")
    report.counts["matches_snapshotted"] = len(snapshot["matches"])
    return _finish(store, {}, {store.snapshot_path(now): snapshot}, report, DEFAULT_CONFIG)


def _finish(
    store: OutputStore,
    feed: dict[Any, dict[str, Any]],
    records: dict[Path, Any],
    report: RunReport,
    config: DecisionConfig,
) -> RunReport:
    if report.dry_run:
        for kind, doc in feed.items():
            check(kind, doc, config)
        return report
    report.written = store.publish(feed, records, config)
    return report
