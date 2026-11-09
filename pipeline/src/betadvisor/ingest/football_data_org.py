"""football-data.org v4: fixtures and results for PL, PD, BL1 and FL1 (free tier).

One request per competition covers a date range, so a run fetches fixtures (next 48 h) and
results (last 14 days) with four requests. Team names are mapped through the ``fdorg_names``
column of ``teams.csv`` (full name first, then short name); any unknown name fails the run.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from betadvisor.errors import SourceError
from betadvisor.ingest.base import LEAGUE_CODES, Fixture, LeagueCode, MatchResult, MatchStatus
from betadvisor.ingest.http import HttpClient, require_ok
from betadvisor.teams import TeamRegistry, UnknownTeamError, default_registry

SOURCE = "fdorg"
BASE_URL = "https://api.football-data.org/v4"

# football-data.org status -> our status. A suspended match did not finish: it settles void,
# like an abandoned one. An awarded result was decided off the pitch: also void.
STATUS_MAP: dict[str, MatchStatus] = {
    "SCHEDULED": "scheduled",
    "TIMED": "scheduled",
    "IN_PLAY": "in_play",
    "PAUSED": "in_play",
    "LIVE": "in_play",
    "FINISHED": "finished",
    "POSTPONED": "postponed",
    "CANCELLED": "cancelled",
    "SUSPENDED": "abandoned",
    "AWARDED": "abandoned",
}


@dataclass(frozen=True, slots=True)
class FdMatch:
    """One football-data.org match with team codes resolved."""

    league: LeagueCode
    source_id: str
    home_code: str
    away_code: str
    kickoff_at: datetime
    status: MatchStatus
    home_goals: int | None
    away_goals: int | None

    def fixture(self) -> Fixture:
        return Fixture(self.league, self.home_code, self.away_code, self.kickoff_at, self.source_id)

    def result(self) -> MatchResult:
        return MatchResult(
            self.league,
            self.home_code,
            self.away_code,
            self.kickoff_at,
            self.status,
            self.home_goals,
            self.away_goals,
        )


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SourceError(f"{SOURCE}: timestamp without timezone: {value!r}")
    return parsed


@dataclass
class FootballDataOrg:
    """Implements ``FixtureSource`` and ``ResultSource``."""

    http: HttpClient
    token: str
    leagues: Sequence[LeagueCode] = LEAGUE_CODES
    registry: TeamRegistry = field(default_factory=default_registry)
    _cache: dict[tuple[LeagueCode, date, date], list[FdMatch]] = field(
        default_factory=dict, repr=False
    )

    def matches(self, date_from: date, date_to: date) -> list[FdMatch]:
        """Every match of every league with a kickoff date in the range (inclusive)."""
        out: list[FdMatch] = []
        for league in self.leagues:
            out.extend(self._league_matches(league, date_from, date_to))
        return sorted(out, key=lambda m: (m.kickoff_at, m.league, m.home_code))

    def fixtures(self, date_from: date, date_to: date) -> list[Fixture]:
        return [m.fixture() for m in self.matches(date_from, date_to) if m.status == "scheduled"]

    def results(self, date_from: date, date_to: date) -> list[MatchResult]:
        final = ("finished", "postponed", "cancelled", "abandoned")
        return [m.result() for m in self.matches(date_from, date_to) if m.status in final]

    def _league_matches(self, league: LeagueCode, date_from: date, date_to: date) -> list[FdMatch]:
        key = (league, date_from, date_to)
        if key not in self._cache:
            body = require_ok(
                self.http.get_json(
                    f"{BASE_URL}/competitions/{league}/matches",
                    params={"dateFrom": date_from.isoformat(), "dateTo": date_to.isoformat()},
                    headers={"X-Auth-Token": self.token},
                ),
                f"{SOURCE} {league} matches",
            )
            self._cache[key] = self._parse(league, body)
        return self._cache[key]

    def _parse(self, league: LeagueCode, body: Any) -> list[FdMatch]:
        if not isinstance(body, dict) or not isinstance(body.get("matches"), list):
            raise SourceError(f"{SOURCE} {league}: response has no 'matches' list")
        out: list[FdMatch] = []
        unknown: list[str] = []
        for raw in body["matches"]:
            try:
                status_raw = raw["status"]
                home, away = raw["homeTeam"], raw["awayTeam"]
                kickoff = parse_utc(raw["utcDate"])
                full_time = raw["score"]["fullTime"]
                source_id = str(raw["id"])
            except (KeyError, TypeError) as exc:
                raise SourceError(f"{SOURCE} {league}: match without field {exc}") from None
            if status_raw not in STATUS_MAP:
                raise SourceError(f"{SOURCE} {league}: unknown match status {status_raw!r}")
            status = STATUS_MAP[status_raw]
            codes = [self._code(team, unknown) for team in (home, away)]
            if codes[0] is None or codes[1] is None:
                continue
            goals: tuple[int | None, int | None] = (None, None)
            if status == "finished":
                hg, ag = full_time.get("home"), full_time.get("away")
                if not isinstance(hg, int) or not isinstance(ag, int):
                    raise SourceError(f"{SOURCE} {league} match {source_id}: finished, no score")
                goals = (hg, ag)
            out.append(FdMatch(league, source_id, codes[0], codes[1], kickoff, status, *goals))
        if unknown:
            raise UnknownTeamError(SOURCE, unknown)
        return out

    def _code(self, team: Any, unknown: list[str]) -> str | None:
        if not isinstance(team, dict):
            raise SourceError(f"{SOURCE}: team is not an object: {team!r}")
        name = team.get("name")
        short = team.get("shortName")
        for candidate in (name, short):
            if isinstance(candidate, str):
                code = self.registry.lookup(SOURCE, candidate)
                if code is not None:
                    return code
        unknown.append(str(name if name is not None else short))
        return None
