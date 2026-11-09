"""Adapter protocols for every external data source (NFR-M2).

Each source (fixtures, odds, results, availability, history) sits behind a small protocol so a
provider can be swapped without touching features, models or the decision engine. Adapters
return team *codes* from ``teams.csv``, never raw provider names: name normalization happens
inside the adapter and unknown names fail loudly (FR-D11).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Protocol, runtime_checkable

import pandas as pd

LeagueCode = Literal["PL", "PD", "BL1", "FL1"]
LEAGUE_CODES: tuple[LeagueCode, ...] = ("PL", "PD", "BL1", "FL1")

MatchStatus = Literal["scheduled", "in_play", "finished", "postponed", "cancelled", "abandoned"]
AvailabilityStatus = Literal["reported", "unknown"]


@dataclass(frozen=True, slots=True)
class Fixture:
    """A scheduled match. ``kickoff_at`` is timezone-aware UTC."""

    league: LeagueCode
    home_code: str
    away_code: str
    kickoff_at: datetime
    source_id: str


@dataclass(frozen=True, slots=True)
class OddsQuote:
    """1X2 decimal odds from one bookmaker at one moment (``fetched_at`` is UTC)."""

    league: LeagueCode
    home_code: str
    away_code: str
    kickoff_at: datetime
    bookmaker: str
    home: float
    draw: float
    away: float
    fetched_at: datetime


@dataclass(frozen=True, slots=True)
class MatchResult:
    """Final state of a match. Goals are ``None`` unless ``status`` is ``finished``."""

    league: LeagueCode
    home_code: str
    away_code: str
    kickoff_at: datetime
    status: MatchStatus
    home_goals: int | None
    away_goals: int | None


@dataclass(frozen=True, slots=True)
class TeamAvailability:
    """Injuries and suspensions for one team. ``unknown`` means no data, never "none missing"."""

    team_code: str
    status: AvailabilityStatus
    missing_players: tuple[str, ...] = ()


@runtime_checkable
class FixtureSource(Protocol):
    def fixtures(self, date_from: date, date_to: date) -> list[Fixture]:
        """Matches with a kickoff between the two dates (inclusive)."""
        ...


@runtime_checkable
class OddsSource(Protocol):
    def odds(self, leagues: Sequence[LeagueCode]) -> list[OddsQuote]:
        """Current 1X2 quotes for upcoming matches in these leagues."""
        ...


@runtime_checkable
class ResultSource(Protocol):
    def results(self, date_from: date, date_to: date) -> list[MatchResult]:
        """Results (or postponements) for matches between the two dates (inclusive)."""
        ...


@runtime_checkable
class AvailabilitySource(Protocol):
    def availability(self, fixtures: Sequence[Fixture]) -> dict[str, TeamAvailability]:
        """Availability of both sides of every fixture, keyed by team code. Teams without data
        come back as ``unknown``, never as "nobody missing"."""
        ...


@runtime_checkable
class HistorySource(Protocol):
    def history(self) -> pd.DataFrame:
        """Past matches in the normalized history format (see ``HISTORY_COLUMNS``)."""
        ...
