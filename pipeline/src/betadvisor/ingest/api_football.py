"""API-Football v3 (optional): injuries and suspensions per league and match date.

No key means the source is ``disabled`` and every team is ``unknown`` (the signals then carry
the ``low_data`` flag). A failed request, or a response naming a team ``teams.csv`` does not
know, makes every team of that league and date ``unknown`` and marks the source ``degraded``.
Missing injury data is never treated as "nobody is missing".
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date
from typing import Any, Literal

from betadvisor.errors import SourceError
from betadvisor.ingest.base import Fixture, LeagueCode, TeamAvailability
from betadvisor.ingest.http import HttpClient, require_ok
from betadvisor.teams import TeamRegistry, default_registry

SOURCE = "api_football"
BASE_URL = "https://v3.football.api-sports.io"
LEAGUE_IDS: dict[LeagueCode, int] = {"PL": 39, "PD": 140, "BL1": 78, "FL1": 61}
MAX_LABEL = 80

HealthStatus = Literal["ok", "degraded", "failed", "disabled"]


@dataclass(frozen=True, slots=True)
class AvailabilityReport:
    teams: dict[str, TeamAvailability]
    status: HealthStatus
    detail: str | None


def season_start(day: date) -> int:
    """API-Football names a season by the year it starts (July cut-over)."""
    return day.year if day.month >= 7 else day.year - 1


def absence_label(player: Any) -> str:
    """``"Name (out)"``, ``"Name (doubtful)"`` or ``"Name (suspended)"``."""
    name = str(player.get("name") or "").strip()
    if not name:
        raise SourceError(f"{SOURCE}: injury entry without a player name")
    reason = str(player.get("reason") or "").lower()
    kind = str(player.get("type") or "")
    if "suspen" in reason or "card" in reason:
        tag = "suspended"
    elif kind == "Questionable":
        tag = "doubtful"
    else:
        tag = "out"
    label = f"{name} ({tag})"
    if len(label) > MAX_LABEL:
        label = f"{name[: MAX_LABEL - len(tag) - 4]}… ({tag})"
    return label


@dataclass
class ApiFootball:
    """Implements ``AvailabilitySource``; ``api_key=None`` disables it."""

    http: HttpClient
    api_key: str | None
    registry: TeamRegistry = field(default_factory=default_registry)

    def availability(self, fixtures: Sequence[Fixture]) -> dict[str, TeamAvailability]:
        return self.report(fixtures).teams

    def report(self, fixtures: Sequence[Fixture]) -> AvailabilityReport:
        teams = {code for f in fixtures for code in (f.home_code, f.away_code)}
        unknown_all = {c: TeamAvailability(c, "unknown") for c in sorted(teams)}
        if not self.api_key:
            return AvailabilityReport(unknown_all, "disabled", "no API_FOOTBALL_KEY configured")
        if not fixtures:
            return AvailabilityReport({}, "ok", None)

        groups: dict[tuple[LeagueCode, date], list[Fixture]] = {}
        for f in fixtures:
            groups.setdefault((f.league, f.kickoff_at.astimezone(UTC).date()), []).append(f)

        out: dict[str, TeamAvailability] = {}
        problems: list[str] = []
        for (league, day), group in sorted(groups.items()):
            codes = {c for f in group for c in (f.home_code, f.away_code)}
            try:
                missing = self._injuries(league, day)
            except SourceError as exc:
                problems.append(f"{league} {day}: {exc}")
                out.update({c: TeamAvailability(c, "unknown") for c in codes})
                continue
            for code in sorted(codes):
                players = tuple(sorted(set(missing.get(code, []))))
                out[code] = TeamAvailability(code, "reported", players)

        if not problems:
            return AvailabilityReport(out, "ok", None)
        status: HealthStatus = "failed" if len(problems) == len(groups) else "degraded"
        return AvailabilityReport(out, status, "; ".join(problems)[:300])

    def _injuries(self, league: LeagueCode, day: date) -> dict[str, list[str]]:
        assert self.api_key is not None
        body = require_ok(
            self.http.get_json(
                f"{BASE_URL}/injuries",
                params={
                    "league": str(LEAGUE_IDS[league]),
                    "season": str(season_start(day)),
                    "date": day.isoformat(),
                },
                headers={"x-apisports-key": self.api_key},
            ),
            f"{SOURCE} injuries",
        )
        if not isinstance(body, dict) or not isinstance(body.get("response"), list):
            raise SourceError("response has no 'response' list")
        errors = body.get("errors")
        if errors:
            raise SourceError(f"API error {errors}")
        out: dict[str, list[str]] = {}
        unknown: list[str] = []
        for item in body["response"]:
            team_name = str((item.get("team") or {}).get("name") or "")
            code = self.registry.lookup(SOURCE, team_name)
            if code is None:
                unknown.append(team_name)
                continue
            out.setdefault(code, []).append(absence_label(item.get("player") or {}))
        if unknown:
            raise SourceError(f"unknown team name(s) {sorted(set(unknown))} (add to teams.csv)")
        return out
