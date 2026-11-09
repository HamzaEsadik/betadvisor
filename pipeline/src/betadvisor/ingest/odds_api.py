"""The Odds API v4: 1X2 (``h2h``) prices from EU bookmakers, one request per league.

* **Cost.** ``regions=eu&markets=h2h`` costs 1 credit per league request.
* **Disk cache.** Each response is stored under ``<cache>/<YYYY-MM-DD>/<league>-<HHMMSS>.json``
  and reused while younger than ``cache_ttl``, so reruns and dry runs spend no credits.
* **Quota guard.** The ``x-requests-remaining`` header of every response is kept (also on disk).
  A request is refused before it is sent when it would take the quota below ``reserve``.
* **Consensus.** :func:`consensus_odds` takes the median price per outcome across books and
  names the book whose three prices are closest to that median.
"""

from __future__ import annotations

import json
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from betadvisor.errors import QuotaExhaustedError, SourceError
from betadvisor.ingest.base import LEAGUE_CODES, LeagueCode, OddsQuote
from betadvisor.ingest.football_data_org import parse_utc
from betadvisor.ingest.http import HttpClient, HttpResult, require_ok
from betadvisor.teams import TeamRegistry, UnknownTeamError, default_registry

SOURCE = "odds_api"
BASE_URL = "https://api.the-odds-api.com/v4"
SPORT_KEYS: dict[LeagueCode, str] = {
    "PL": "soccer_epl",
    "PD": "soccer_spain_la_liga",
    "BL1": "soccer_germany_bundesliga",
    "FL1": "soccer_france_ligue_one",
}
CREDITS_PER_REQUEST = 1  # one region x one market
DEFAULT_RESERVE = 50
DEFAULT_CACHE_TTL = timedelta(minutes=60)
QUOTA_FILE = "quota.json"


@dataclass(frozen=True, slots=True)
class MatchOdds:
    """Consensus 1X2 odds for one match."""

    league: LeagueCode
    home_code: str
    away_code: str
    kickoff_at: datetime
    home: float
    draw: float
    away: float
    bookmaker: str
    n_books: int
    fetched_at: datetime


def _median_price(values: list[float]) -> float:
    return round(float(statistics.median(values)), 2)


def consensus_odds(quotes: Sequence[OddsQuote]) -> list[MatchOdds]:
    """One :class:`MatchOdds` per match: median price per outcome across books.

    ``bookmaker`` is the book with the smallest summed distance to the three medians (ties go
    to the alphabetically first key). ``fetched_at`` is the latest fetch among the quotes.
    """
    groups: dict[tuple[LeagueCode, str, str, datetime], list[OddsQuote]] = {}
    for q in quotes:
        groups.setdefault((q.league, q.home_code, q.away_code, q.kickoff_at), []).append(q)
    out: list[MatchOdds] = []
    for (league, home, away, kickoff), group in sorted(groups.items(), key=lambda kv: kv[0][3]):
        med = (
            _median_price([q.home for q in group]),
            _median_price([q.draw for q in group]),
            _median_price([q.away for q in group]),
        )
        closest = min(
            group,
            key=lambda q: (
                abs(q.home - med[0]) + abs(q.draw - med[1]) + abs(q.away - med[2]),
                q.bookmaker,
            ),
        )
        out.append(
            MatchOdds(
                league,
                home,
                away,
                kickoff,
                *med,
                bookmaker=closest.bookmaker,
                n_books=len({q.bookmaker for q in group}),
                fetched_at=max(q.fetched_at for q in group),
            )
        )
    return out


@dataclass
class OddsApi:
    """Implements ``OddsSource``. ``cache_dir=None`` disables the disk cache and quota file."""

    http: HttpClient
    api_key: str
    now: datetime
    cache_dir: Path | None = None
    reserve: int = DEFAULT_RESERVE
    cache_ttl: timedelta = DEFAULT_CACHE_TTL
    registry: TeamRegistry = field(default_factory=default_registry)
    remaining: int | None = None
    credits_used: int = 0
    cache_hits: int = 0

    def __post_init__(self) -> None:
        if self.now.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        if self.remaining is None and self.cache_dir is not None:
            path = self.cache_dir / QUOTA_FILE
            if path.exists():
                self.remaining = int(json.loads(path.read_text())["remaining"])

    def odds(self, leagues: Sequence[LeagueCode] = LEAGUE_CODES) -> list[OddsQuote]:
        out: list[OddsQuote] = []
        unknown: list[str] = []
        for league in leagues:
            body, fetched_at = self._fetch(league)
            out.extend(self._parse(league, body, fetched_at, unknown))
        if unknown:
            raise UnknownTeamError(SOURCE, unknown)
        return out

    # -- network, cache, quota ---------------------------------------------------------------

    def _fetch(self, league: LeagueCode) -> tuple[Any, datetime]:
        cached = self._from_cache(league)
        if cached is not None:
            self.cache_hits += 1
            return cached
        self._guard()
        result = self.http.get_json(
            f"{BASE_URL}/sports/{SPORT_KEYS[league]}/odds",
            params={
                "apiKey": self.api_key,
                "regions": "eu",
                "markets": "h2h",
                "oddsFormat": "decimal",
                "dateFormat": "iso",
            },
        )
        self._track_quota(result)
        body = require_ok(result, f"{SOURCE} {league} odds")
        self._to_cache(league, body)
        return body, self.now

    def _guard(self) -> None:
        if self.remaining is not None and self.remaining - CREDITS_PER_REQUEST < self.reserve:
            raise QuotaExhaustedError(
                f"{SOURCE}: {self.remaining} credits left, reserve is {self.reserve}; "
                "request not sent"
            )

    def _track_quota(self, result: HttpResult) -> None:
        remaining = result.headers.get("x-requests-remaining")
        last = result.headers.get("x-requests-last")
        if last is not None:
            self.credits_used += int(float(last))
        if remaining is None:
            return
        self.remaining = int(float(remaining))
        if self.cache_dir is not None:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            state = {"remaining": self.remaining, "checked_at": _iso(self.now)}
            (self.cache_dir / QUOTA_FILE).write_text(json.dumps(state) + "\n")

    def _from_cache(self, league: LeagueCode) -> tuple[Any, datetime] | None:
        if self.cache_dir is None or self.cache_ttl <= timedelta(0):
            return None
        day_dir = self.cache_dir / self.now.astimezone(UTC).strftime("%Y-%m-%d")
        for path in sorted(day_dir.glob(f"{league}-*.json"), reverse=True):
            data = json.loads(path.read_text(encoding="utf-8"))
            fetched_at = parse_utc(data["fetched_at"])
            if self.now - self.cache_ttl <= fetched_at <= self.now:
                return data["body"], fetched_at
        return None

    def _to_cache(self, league: LeagueCode, body: Any) -> None:
        if self.cache_dir is None:
            return
        now = self.now.astimezone(UTC)
        day_dir = self.cache_dir / now.strftime("%Y-%m-%d")
        day_dir.mkdir(parents=True, exist_ok=True)
        path = day_dir / f"{league}-{now:%H%M%S}.json"
        path.write_text(json.dumps({"fetched_at": _iso(now), "body": body}) + "\n")

    # -- parsing -------------------------------------------------------------------------------

    def _parse(
        self, league: LeagueCode, body: Any, fetched_at: datetime, unknown: list[str]
    ) -> list[OddsQuote]:
        if not isinstance(body, list):
            raise SourceError(f"{SOURCE} {league}: expected a list of events")
        out: list[OddsQuote] = []
        for event in body:
            try:
                home_name, away_name = event["home_team"], event["away_team"]
                kickoff = parse_utc(event["commence_time"])
                bookmakers = event["bookmakers"]
            except (KeyError, TypeError) as exc:
                raise SourceError(f"{SOURCE} {league}: event without field {exc}") from None
            home = self.registry.lookup(SOURCE, home_name)
            away = self.registry.lookup(SOURCE, away_name)
            if home is None:
                unknown.append(home_name)
            if away is None:
                unknown.append(away_name)
            if home is None or away is None:
                continue
            for book in bookmakers:
                prices = _h2h_prices(book, home_name, away_name)
                if prices is None:
                    continue
                out.append(
                    OddsQuote(league, home, away, kickoff, str(book["key"]), *prices, fetched_at)
                )
        return out


def _h2h_prices(book: Any, home_name: str, away_name: str) -> tuple[float, float, float] | None:
    """(home, draw, away) from a bookmaker's h2h market, or ``None`` if incomplete."""
    for market in book.get("markets", []):
        if market.get("key") != "h2h":
            continue
        prices = {o.get("name"): o.get("price") for o in market.get("outcomes", [])}
        trio = (prices.get(home_name), prices.get("Draw"), prices.get(away_name))
        if all(isinstance(p, int | float) and p > 1 for p in trio):
            return float(trio[0]), float(trio[1]), float(trio[2])  # type: ignore[arg-type]
    return None


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
