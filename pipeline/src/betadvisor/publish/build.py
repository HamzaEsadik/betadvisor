"""Build the three feed documents from decisions, results and source health."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.decision.edge import stake_fraction
from betadvisor.decision.select import SignalDecision
from betadvisor.ingest.base import LeagueCode, MatchResult, TeamAvailability
from betadvisor.publish.store import closing_odds_for, iso
from betadvisor.publish.validate import parse_ts
from betadvisor.teams import TeamRegistry

SCHEMA_VERSION = 1
MIN_APP_VERSION = "0.1.0"
LEAGUE_NAMES: dict[LeagueCode, str] = {
    "PL": "Premier League",
    "PD": "La Liga",
    "BL1": "Bundesliga",
    "FL1": "Ligue 1",
}
SIGNAL_WINDOW_PAST = timedelta(hours=24)
SIGNAL_WINDOW_AHEAD = timedelta(hours=48)
RESULTS_WINDOW = timedelta(days=14)
CLOSING_WINDOW = timedelta(hours=3)
SUMMARY_MAX = 280
# Fields that do not count as a change of the signal (FR-D8). ``odds_fetched_at`` is when these
# odds were first seen; seeing the same prices again later is not a new version.
VERSION_FIELDS = frozenset({"version", "versioned_at", "supersedes", "odds_fetched_at"})
RESULT_STATUS = {
    "finished": "FINISHED",
    "postponed": "POSTPONED",
    "cancelled": "CANCELLED",
    "abandoned": "ABANDONED",
}

HealthStatus = Literal["ok", "degraded", "failed", "disabled"]


@dataclass(frozen=True, slots=True)
class Health:
    status: HealthStatus
    detail: str | None = None

    def to_json(self, checked_at: datetime) -> dict[str, Any]:
        detail = self.detail[:300] if self.detail else None
        return {"status": self.status, "checked_at": iso(checked_at), "detail": detail}


def match_id(league: str, home: str, away: str, kickoff_at: datetime) -> str:
    return f"{league}_{kickoff_at.astimezone(UTC):%Y%m%d}_{home}_{away}"


def signal_id(league: str, home: str, away: str, kickoff_at: datetime, selection: str) -> str:
    return f"{kickoff_at.astimezone(UTC):%Y-%m-%d}_{league}_{home}-{away}_1X2_{selection}"


# -- signals -----------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MatchContext:
    league: LeagueCode
    home_code: str
    away_code: str
    kickoff_at: datetime
    home_form: str
    away_form: str
    home_availability: TeamAvailability
    away_availability: TeamAvailability


def _pct(x: float) -> str:
    return f"{100 * x:.0f}%"


def _signed_pct(x: float) -> str:
    return f"{100 * x:+.1f}%"


def summary(
    ctx: MatchContext,
    d: SignalDecision,
    model_prob: float,
    edge: float,
    registry: TeamRegistry,
    config: DecisionConfig,
) -> str:
    """One or two plain sentences explaining the signal (at most 280 characters)."""
    home = registry.team(ctx.home_code).display_name
    away = registry.team(ctx.away_code).display_name
    pick = {"HOME": home, "DRAW": "a draw", "AWAY": away}[d.selection]
    if d.recommended:
        head = (
            f"Model gives {pick} {_pct(model_prob)} against {_pct(d.implied_prob)} implied by "
            f"the market (edge {_signed_pct(edge)})."
        )
    elif d.skip_reason == "no_edge":
        head = "No value: the market prices every outcome at or above the model."
    elif d.skip_reason == "below_threshold":
        head = (
            f"Best edge is {_signed_pct(edge)} on {pick}, below the "
            f"{_pct(config.min_edge)} minimum."
        )
    elif d.skip_reason == "odds_out_of_range":
        head = (
            f"Best edge is on {pick} at {d.odds:.2f}, outside the {config.min_odds:.2f} to "
            f"{config.max_odds:.2f} odds range."
        )
    elif d.skip_reason == "low_confidence":
        head = f"Edge {_signed_pct(edge)} on {pick} is too small to trust with limited data."
    else:
        head = "Required data is missing or the odds are too old to use."
    form = f" Form: {home} {ctx.home_form or 'n/a'}, {away} {ctx.away_form or 'n/a'}."
    if "unknown" in (ctx.home_availability.status, ctx.away_availability.status):
        avail = " Injury data unavailable."
    else:
        n_home = len(ctx.home_availability.missing_players)
        n_away = len(ctx.away_availability.missing_players)
        avail = f" Absences: {home} {n_home}, {away} {n_away}." if n_home or n_away else ""
    text = head + form + avail
    if len(text) > SUMMARY_MAX:
        text = (head + form)[:SUMMARY_MAX]
    return text[:SUMMARY_MAX]


def signal_entry(
    ctx: MatchContext,
    d: SignalDecision,
    now: datetime,
    registry: TeamRegistry,
    config: DecisionConfig = DEFAULT_CONFIG,
) -> dict[str, Any]:
    """A version-1 signal entry. Probabilities are rounded to 6 places and edge and stake are
    recomputed from the rounded values, so the published numbers satisfy SRS 6.2 and 6.3."""
    if d.model_prob is None:
        raise ValueError(f"{d.match_id}: no model probability; drop the match before publishing")
    p = round(d.model_prob, 6)
    edge = round(p * d.odds - 1, 6)
    stake = round(stake_fraction(p, d.odds, config), 6) if d.recommended else 0
    unknown = "unknown" in (ctx.home_availability.status, ctx.away_availability.status)
    return {
        "signal_id": signal_id(
            ctx.league, ctx.home_code, ctx.away_code, ctx.kickoff_at, d.selection
        ),
        "version": 1,
        "versioned_at": iso(now),
        "supersedes": None,
        "match_id": match_id(ctx.league, ctx.home_code, ctx.away_code, ctx.kickoff_at),
        "league": LEAGUE_NAMES[ctx.league],
        "league_code": ctx.league,
        "home_team": registry.team(ctx.home_code).display_name,
        "away_team": registry.team(ctx.away_code).display_name,
        "home_code": ctx.home_code,
        "away_code": ctx.away_code,
        "kickoff_at": iso(ctx.kickoff_at),
        "market": "1X2",
        "selection": d.selection,
        "odds": d.odds,
        "bookmaker": d.bookmaker,
        "odds_fetched_at": iso(d.odds_fetched_at),
        "model_prob": p,
        "implied_prob": round(d.implied_prob, 6),
        "edge": edge,
        "stake_fraction": stake,
        "recommended": d.recommended,
        "skip_reason": d.skip_reason,
        "quality_flags": list(d.quality_flags),
        "context": {
            "home_form": ctx.home_form,
            "away_form": ctx.away_form,
            "availability_status": "unknown" if unknown else "reported",
            "injuries_home": [] if unknown else list(ctx.home_availability.missing_players),
            "injuries_away": [] if unknown else list(ctx.away_availability.missing_players),
            "lineup_confirmed": False,
            "summary": summary(ctx, d, p, edge, registry, config),
        },
    }


def _content(entry: Mapping[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in entry.items() if k not in VERSION_FIELDS}


def apply_versions(
    entries: Iterable[dict[str, Any]], latest: Mapping[str, dict[str, Any]], now: datetime
) -> tuple[list[dict[str, Any]], int]:
    """Give each new entry its version (FR-D8). Returns the entries and the count of new
    versions (v1 included).

    * Never published: version 1.
    * Same content as the latest published version: that version, unchanged.
    * Changed: version ``n + 1`` superseding version ``n``, ``versioned_at = now``.
    """
    out: list[dict[str, Any]] = []
    changed = 0
    for entry in entries:
        prev = latest.get(entry["signal_id"])
        if prev is None:
            out.append(entry)
            changed += 1
        elif _content(prev) == _content(entry):
            out.append(dict(prev))
        else:
            if parse_ts(prev["versioned_at"]) >= now:
                raise ValueError(f"{entry['signal_id']}: latest version is not older than now")
            out.append(
                {
                    **entry,
                    "version": prev["version"] + 1,
                    "versioned_at": iso(now),
                    "supersedes": {
                        "version": prev["version"],
                        "versioned_at": prev["versioned_at"],
                    },
                }
            )
            changed += 1
    return out, changed


def merge_feed(
    fresh: list[dict[str, Any]], previous: dict[str, Any] | None, now: datetime
) -> list[dict[str, Any]]:
    """Fresh entries plus previously published ones still inside the feed window whose match
    was not re-decided this run (kicked off already, or no odds this time)."""
    fresh_matches = {s["match_id"] for s in fresh}
    carried = []
    for s in (previous or {}).get("signals", []):
        kickoff = parse_ts(s["kickoff_at"])
        in_window = now - SIGNAL_WINDOW_PAST <= kickoff <= now + SIGNAL_WINDOW_AHEAD
        if in_window and s["match_id"] not in fresh_matches:
            carried.append(s)
    return sorted(carried + fresh, key=lambda s: (s["kickoff_at"], s["match_id"]))


def signals_doc(signals: list[dict[str, Any]], now: datetime, model_version: str) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso(now),
        "model_version": model_version,
        "signals": signals,
    }


# -- results -----------------------------------------------------------------------------------


def results_doc(
    results: Iterable[MatchResult], snapshots: list[dict[str, Any]], now: datetime
) -> dict[str, Any]:
    entries = []
    for r in sorted(results, key=lambda r: (r.kickoff_at, r.league, r.home_code)):
        if not now - RESULTS_WINDOW <= r.kickoff_at <= now:
            continue
        mid = match_id(r.league, r.home_code, r.away_code, r.kickoff_at)
        entries.append(
            {
                "match_id": mid,
                "status": RESULT_STATUS[r.status],
                "home_goals": r.home_goals if r.status == "finished" else None,
                "away_goals": r.away_goals if r.status == "finished" else None,
                "closing_odds": closing_odds_for(snapshots, mid, r.kickoff_at, CLOSING_WINDOW),
            }
        )
    return {"schema_version": SCHEMA_VERSION, "generated_at": iso(now), "results": entries}


# -- meta --------------------------------------------------------------------------------------


def meta_doc(
    now: datetime,
    model_version: str,
    health: Mapping[str, Health | dict[str, Any]],
    notice: str | None,
) -> dict[str, Any]:
    """``health`` values are fresh :class:`Health` objects or entries kept from the last meta."""
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso(now),
        "model_version": model_version,
        "min_app_version": MIN_APP_VERSION,
        "notice": notice,
        "sources_health": {
            name: h.to_json(now) if isinstance(h, Health) else h for name, h in health.items()
        },
    }
