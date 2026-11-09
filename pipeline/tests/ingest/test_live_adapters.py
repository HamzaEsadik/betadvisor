"""football-data.org, The Odds API and API-Football adapters (offline: recordings and fakes)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from betadvisor.errors import QuotaExhaustedError, SourceError
from betadvisor.ingest.api_football import ApiFootball, absence_label, season_start
from betadvisor.ingest.base import Fixture, OddsQuote
from betadvisor.ingest.football_data_org import FootballDataOrg
from betadvisor.ingest.http import (
    HttpResult,
    Params,
    RecordedHttp,
    RecordingHttp,
    RecordingMissingError,
    recording_name,
)
from betadvisor.ingest.odds_api import OddsApi, consensus_odds
from betadvisor.teams import UnknownTeamError
from tests.live_fixture import NOW, RECORDINGS


@dataclass
class FakeHttp:
    """Returns queued results in order and records every request."""

    results: list[HttpResult]
    calls: list[tuple[str, dict[str, str]]] = field(default_factory=list)

    def get_json(
        self, url: str, params: Params | None = None, headers: Params | None = None
    ) -> HttpResult:
        self.calls.append((url, dict(params or {})))
        return self.results.pop(0)


def recorded_body(name_part: str) -> Any:
    path = next(p for p in RECORDINGS.glob("*.json") if name_part in p.name)
    return json.loads(path.read_text())["body"]


# -- http ------------------------------------------------------------------------------------


def test_recording_name_drops_secrets_and_sorts_params() -> None:
    a = recording_name("https://x.org/v4/odds", {"regions": "eu", "apiKey": "SECRET"})
    b = recording_name("https://x.org/v4/odds", {"apiKey": "OTHER", "regions": "eu"})
    assert a == b == "x.org_v4_odds__regions=eu.json"


def test_recording_round_trip_has_no_secret(tmp_path: Path) -> None:
    inner = FakeHttp([HttpResult(200, {"x-requests-remaining": "9"}, [1, 2])])
    RecordingHttp(inner, tmp_path).get_json("https://x.org/a", {"apiKey": "SECRET", "q": "1"})
    saved = next(tmp_path.iterdir()).read_text()
    assert "SECRET" not in saved
    replay = RecordedHttp(tmp_path).get_json("https://x.org/a", {"q": "1", "apiKey": "zzz"})
    assert replay == HttpResult(200, {"x-requests-remaining": "9"}, [1, 2])
    with pytest.raises(RecordingMissingError):
        RecordedHttp(tmp_path).get_json("https://x.org/b")


# -- football-data.org -----------------------------------------------------------------------


def fdorg() -> FootballDataOrg:
    return FootballDataOrg(RecordedHttp(RECORDINGS), "token")


def test_fdorg_maps_statuses_and_teams() -> None:
    matches = fdorg().matches(date(2026, 10, 26), date(2026, 11, 11))
    by_pair = {(m.home_code, m.away_code): m for m in matches}
    assert by_pair["ARS", "CHE"].status == "scheduled"
    assert by_pair["ARS", "CHE"].kickoff_at == datetime(2026, 11, 9, 20, tzinfo=UTC)
    assert (by_pair["AVL", "BOU"].status, by_pair["AVL", "BOU"].home_goals) == ("finished", 2)
    assert by_pair["CRY", "WHU"].status == "postponed"
    assert by_pair["CRY", "WHU"].home_goals is None
    assert by_pair["TSG", "SCF"].status == "abandoned"  # SUSPENDED settles void


def test_fdorg_fixtures_and_results_split() -> None:
    source = fdorg()
    fixtures = source.fixtures(date(2026, 10, 26), date(2026, 11, 11))
    results = source.results(date(2026, 10, 26), date(2026, 11, 11))
    assert {(f.home_code, f.away_code) for f in fixtures} >= {("ARS", "CHE"), ("BAY", "BVB")}
    assert {r.status for r in results} == {"finished", "postponed", "abandoned"}


def _fd_body(home: dict[str, Any], status: str = "TIMED", score: Any = None) -> dict[str, Any]:
    return {
        "matches": [
            {
                "id": 1,
                "utcDate": "2026-11-09T20:00:00Z",
                "status": status,
                "homeTeam": home,
                "awayTeam": {"name": "Chelsea FC", "shortName": "Chelsea"},
                "score": {"fullTime": score or {"home": None, "away": None}},
            }
        ]
    }


def test_fdorg_short_name_fallback_and_unknown_team() -> None:
    def source(home: dict[str, Any]) -> FootballDataOrg:
        http = FakeHttp([HttpResult(200, {}, _fd_body(home))])
        return FootballDataOrg(http, "t", leagues=("PL",))

    day = date(2026, 11, 9)
    ok = source({"name": "Arsenal", "shortName": "Arsenal FC"})  # full name unknown, short known
    assert ok.matches(day, day)[0].home_code == "ARS"
    with pytest.raises(UnknownTeamError, match="Arsenal Ladies"):
        source({"name": "Arsenal Ladies"}).matches(day, day)


def test_fdorg_rejects_bad_responses() -> None:
    def source(result: HttpResult) -> FootballDataOrg:
        return FootballDataOrg(FakeHttp([result]), "t", leagues=("PL",))

    day = date(2026, 11, 9)
    with pytest.raises(SourceError, match="HTTP 429"):
        source(HttpResult(429, {}, {"message": "rate limit"})).matches(day, day)
    with pytest.raises(SourceError, match="no 'matches'"):
        source(HttpResult(200, {}, {"oops": 1})).matches(day, day)
    finished_no_score = _fd_body({"name": "Arsenal FC"}, status="FINISHED")
    with pytest.raises(SourceError, match="finished, no score"):
        source(HttpResult(200, {}, finished_no_score)).matches(day, day)
    with pytest.raises(SourceError, match="unknown match status"):
        source(HttpResult(200, {}, _fd_body({"name": "Arsenal FC"}, status="WEIRD"))).matches(
            day, day
        )


# -- The Odds API ----------------------------------------------------------------------------


def quote(book: str, h: float, d: float, a: float) -> OddsQuote:
    kickoff = datetime(2026, 11, 9, 20, tzinfo=UTC)
    return OddsQuote("PL", "ARS", "CHE", kickoff, book, h, d, a, NOW)


def test_consensus_is_median_and_closest_book() -> None:
    quotes = [quote("a", 2.0, 3.4, 3.9), quote("b", 2.1, 3.5, 3.6), quote("c", 2.3, 3.3, 3.7)]
    (odds,) = consensus_odds(quotes)
    assert (odds.home, odds.draw, odds.away) == (2.1, 3.4, 3.7)
    assert odds.bookmaker == "b"  # |0|+|0.1|+|0.1| beats a (0.1+0+0.2) and c (0.2+0.1+0)
    assert odds.n_books == 3


def test_consensus_even_count_median_rounds_to_cents() -> None:
    (odds,) = consensus_odds([quote("a", 2.0, 3.4, 3.9), quote("b", 2.05, 3.5, 3.6)])
    assert odds.home == 2.02 or odds.home == 2.03
    assert odds.draw == 3.45


def test_odds_parses_recording_and_counts_credits() -> None:
    api = OddsApi(RecordedHttp(RECORDINGS), "k", NOW)
    quotes = api.odds(("PL", "BL1"))
    assert {(q.home_code, q.away_code) for q in quotes} >= {("ARS", "CHE"), ("BAY", "BVB")}
    assert api.credits_used == 2
    assert api.remaining == 477  # BL1 was recorded third (PL, PD, BL1, FL1)
    assert all(q.fetched_at == NOW for q in quotes)


def _odds_result(remaining: int, body: Any = None) -> HttpResult:
    headers = {"x-requests-remaining": str(remaining), "x-requests-last": "1"}
    return HttpResult(200, headers, body if body is not None else [])


def test_quota_guard_stops_below_reserve() -> None:
    http = FakeHttp([_odds_result(50), _odds_result(49)])
    api = OddsApi(http, "k", NOW, reserve=50)
    with pytest.raises(QuotaExhaustedError, match="50 credits left"):
        api.odds(("PL", "BL1"))
    assert len(http.calls) == 1  # the second request was never sent


def test_quota_guard_uses_persisted_state(tmp_path: Path) -> None:
    (tmp_path / "quota.json").write_text(json.dumps({"remaining": 40}))
    http = FakeHttp([])
    with pytest.raises(QuotaExhaustedError):
        OddsApi(http, "k", NOW, cache_dir=tmp_path).odds(("PL",))
    assert http.calls == []


def test_odds_cache_reused_within_ttl(tmp_path: Path) -> None:
    first = FakeHttp([_odds_result(400)])
    OddsApi(first, "k", NOW, cache_dir=tmp_path).odds(("PL",))
    assert json.loads((tmp_path / "quota.json").read_text())["remaining"] == 400

    later = NOW + timedelta(minutes=30)
    cached = OddsApi(FakeHttp([]), "k", later, cache_dir=tmp_path)
    cached.odds(("PL",))
    assert (cached.cache_hits, cached.credits_used) == (1, 0)

    expired = FakeHttp([_odds_result(399)])
    OddsApi(expired, "k", NOW + timedelta(hours=2), cache_dir=tmp_path).odds(("PL",))
    assert len(expired.calls) == 1


def test_odds_unknown_team_fails() -> None:
    event = {
        "home_team": "Arsenal",
        "away_team": "Chelsea Reserves",
        "commence_time": "2026-11-09T20:00:00Z",
        "bookmakers": [],
    }
    api = OddsApi(FakeHttp([_odds_result(400, [event])]), "k", NOW)
    with pytest.raises(UnknownTeamError, match="Chelsea Reserves"):
        api.odds(("PL",))


def test_odds_skips_incomplete_books() -> None:
    event = {
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "commence_time": "2026-11-09T20:00:00Z",
        "bookmakers": [
            {"key": "a", "markets": [{"key": "h2h", "outcomes": [
                {"name": "Arsenal", "price": 2},
            ]}]},
            {"key": "b", "markets": [{"key": "h2h", "outcomes": [
                {"name": "Arsenal", "price": 2.0},
                {"name": "Draw", "price": 3.4},
                {"name": "Chelsea", "price": 3.9},
            ]}]},
        ],
    }  # fmt: skip
    quotes = OddsApi(FakeHttp([_odds_result(400, [event])]), "k", NOW).odds(("PL",))
    assert [q.bookmaker for q in quotes] == ["b"]


# -- API-Football ----------------------------------------------------------------------------


def fixture(home: str, away: str, day: int, league: str = "PL") -> Fixture:
    return Fixture(league, home, away, datetime(2026, 11, day, 20, tzinfo=UTC), "x")  # type: ignore[arg-type]


def test_api_football_without_key_is_disabled_and_unknown() -> None:
    report = ApiFootball(FakeHttp([]), None).report([fixture("ARS", "CHE", 9)])
    assert report.status == "disabled"
    assert {a.status for a in report.teams.values()} == {"unknown"}


def test_api_football_reported_and_missing_groups() -> None:
    report = ApiFootball(RecordedHttp(RECORDINGS), "k").report(
        [fixture("ARS", "CHE", 9), fixture("LIV", "MCI", 10)]
    )
    assert report.teams["ARS"].status == "reported"
    assert report.teams["ARS"].missing_players == ("B. Saka (doubtful)",)
    assert report.teams["CHE"].missing_players == ("R. James (out)",)
    assert report.teams["LIV"].status == report.teams["MCI"].status == "unknown"
    assert report.status == "degraded"
    assert report.detail is not None and "PL 2026-11-10" in report.detail


def test_api_football_unknown_team_makes_group_unknown() -> None:
    body = {
        "errors": [],
        "response": [{"team": {"name": "Arsenal Women"}, "player": {"name": "X"}}],
    }
    report = ApiFootball(FakeHttp([HttpResult(200, {}, body)]), "k").report(
        [fixture("ARS", "CHE", 9)]
    )
    assert report.status == "failed"
    assert report.teams["ARS"].status == "unknown"
    assert report.detail is not None and "Arsenal Women" in report.detail


def test_absence_labels_and_season() -> None:
    assert absence_label({"name": "A", "type": "Missing Fixture", "reason": "Red Card"}) == (
        "A (suspended)"
    )
    assert absence_label({"name": "B", "type": "Questionable", "reason": "Knock"}) == "B (doubtful)"
    assert absence_label({"name": "C", "type": "Missing Fixture", "reason": "Knee"}) == "C (out)"
    assert len(absence_label({"name": "N" * 100, "type": "Missing Fixture"})) <= 80
    with pytest.raises(SourceError):
        absence_label({"name": ""})
    assert (season_start(date(2026, 11, 9)), season_start(date(2027, 3, 1))) == (2026, 2026)
