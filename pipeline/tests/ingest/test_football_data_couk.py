"""football-data.co.uk history adapter: season helpers, normalization, caching (no network)."""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path

import pandas as pd
import pytest
import requests
from typer.testing import CliRunner

from betadvisor.cli import app
from betadvisor.ingest.base import HistorySource
from betadvisor.ingest.football_data_couk import (
    HISTORY_COLUMNS,
    FootballDataCoUk,
    HistoryDataError,
    current_season_start,
    decode_csv,
    normalize,
    season_code,
    season_label,
    seasons_up_to,
)
from betadvisor.teams import UnknownTeamError
from tests.conftest import COUK_FIXTURE, FIXTURE_TODAY

NEW_HEADER = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,AvgH,AvgD,AvgA\n"


def raw(*rows: str, header: str = NEW_HEADER) -> str:
    return header + "".join(r + "\n" for r in rows)


class FakeResponse(requests.Response):
    def __init__(self, status: int, body: bytes) -> None:
        super().__init__()
        self.status_code = status
        self._content = body


class FakeHttp:
    def __init__(self, status: int = 200, body: bytes | None = None) -> None:
        self.status = status
        self.body = body
        self.urls: list[str] = []

    def get(self, url: str, *, timeout: float) -> requests.Response:
        self.urls.append(url)
        season, div = url.split("/")[-2:]
        body = self.body
        if body is None:
            body = (COUK_FIXTURE / season / div).read_bytes()
        return FakeResponse(self.status, body)


# --- season helpers -------------------------------------------------------------------------


def test_season_helpers() -> None:
    assert season_code(2014) == "1415"
    assert season_code(2099) == "9900"
    assert season_label(2014) == "2014-15"
    assert current_season_start(date(2026, 11, 9)) == 2026
    assert current_season_start(date(2026, 7, 1)) == 2026
    assert current_season_start(date(2026, 6, 30)) == 2025
    assert seasons_up_to(date(2016, 5, 1)) == [2014, 2015]
    assert seasons_up_to(date(2026, 11, 9))[-1] == 2026


def test_decode_csv_falls_back_to_cp1252() -> None:
    assert decode_csv("﻿Div,é".encode()) == "Div,é"
    assert decode_csv(b"Div,\xe9") == "Div,é"


# --- normalize ------------------------------------------------------------------------------


def test_normalize_old_format(fixture_history: pd.DataFrame) -> None:
    old = fixture_history[fixture_history["season"] == "2014-15"]
    assert len(old) == 12
    first = old.iloc[0]
    assert first["date"] == pd.Timestamp(2014, 8, 16)
    assert (first["home_code"], first["away_code"]) == ("ARS", "CHE")
    assert (first["home_goals"], first["away_goals"]) == (2, 0)
    assert first["avg_home"] == 2.10  # from BbAvH
    assert first["ps_close_home"] == 2.10
    assert pd.isna(first["time"])
    assert math.isnan(first["avg_close_home"])  # AvgC* only exists from 2019-20


def test_normalize_new_format(fixture_history: pd.DataFrame) -> None:
    new = fixture_history[fixture_history["season"] == "2015-16"]
    assert len(new) == 12
    first = new.iloc[0]
    assert first["date"] == pd.Timestamp(2015, 8, 8)
    assert first["time"] == "15:00"
    assert first["avg_close_home"] == 2.06
    assert set(new["home_code"]) == {"ARS", "CHE", "STK", "WAT"}


def test_history_table_shape(fixture_history: pd.DataFrame) -> None:
    assert tuple(fixture_history.columns) == HISTORY_COLUMNS
    assert fixture_history["date"].is_monotonic_increasing
    assert set(fixture_history["league"]) == {"PL"}
    assert fixture_history["home_goals"].dtype == "int64"


def test_normalize_rejects_unknown_team() -> None:
    text = raw("E0,16/08/2024,15:00,Arsenal,Gunners United,1,0,2,3,4")
    with pytest.raises(UnknownTeamError, match="Gunners United"):
        normalize(text, "PL", 2024)


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (raw("E0,16/08/2024,15:00,Arsenal,Chelsea,,0,2,3,4"), "without a score"),
        (raw("E0,16/08/2024,15:00,Arsenal,Chelsea,-1,0,2,3,4"), "invalid goal"),
        (raw("E0,16/08/2024,15:00,Arsenal,Chelsea,1,0,2,x,4"), "AvgD"),
        (raw("SP1,16/08/2024,15:00,Arsenal,Chelsea,1,0,2,3,4"), "unexpected division"),
        (raw("E0,16/08/2023,15:00,Arsenal,Chelsea,1,0,2,3,4"), "outside the season"),
        (raw(",,,,,,,,,"), "no matches"),
        ("Div,Date,HomeTeam,AwayTeam,FTHG\nE0,16/08/2024,Arsenal,Chelsea,1\n", "missing columns"),
        (
            raw(
                "E0,16/08/2024,15:00,Arsenal,Chelsea,1,0,2,3,4",
                "E0,17/08/2024,15:00,Arsenal,Chelsea,1,0,2,3,4",
            ),
            "duplicated fixture",
        ),
    ],
)
def test_normalize_rejects_bad_rows(text: str, message: str) -> None:
    with pytest.raises(HistoryDataError, match=message):
        normalize(text, "PL", 2024)


def test_normalize_accepts_covid_extended_season() -> None:
    table = normalize(raw("E0,26/07/2020,16:00,Arsenal,Watford,3,2,2,3,4"), "PL", 2019)
    assert table.iloc[0]["season"] == "2019-20"


# --- download and cache ---------------------------------------------------------------------


def test_is_a_history_source(couk_cache: Path) -> None:
    assert isinstance(FootballDataCoUk(cache_dir=couk_cache, today=FIXTURE_TODAY), HistorySource)


def test_fetch_downloads_missing_and_always_the_current_season(tmp_path: Path) -> None:
    http = FakeHttp()
    src = FootballDataCoUk(cache_dir=tmp_path, today=FIXTURE_TODAY, leagues=("PL",), http=http)
    assert src.fetch() == [tmp_path / "1415" / "E0.csv", tmp_path / "1516" / "E0.csv"]
    assert http.urls[0] == "https://www.football-data.co.uk/mmz4281/1415/E0.csv"

    http.urls.clear()
    assert src.fetch() == [tmp_path / "1516" / "E0.csv"]  # past season stays cached
    assert src.fetch(refresh=True) == [tmp_path / "1415" / "E0.csv", tmp_path / "1516" / "E0.csv"]
    assert len(src.history()) == 24


@pytest.mark.parametrize(
    ("http", "message"),
    [(FakeHttp(status=404), "HTTP 404"), (FakeHttp(body=b"<html>moved</html>"), "not return")],
)
def test_fetch_fails_loudly(tmp_path: Path, http: FakeHttp, message: str) -> None:
    src = FootballDataCoUk(cache_dir=tmp_path, today=FIXTURE_TODAY, leagues=("PL",), http=http)
    with pytest.raises(HistoryDataError, match=message):
        src.fetch()
    assert not list(tmp_path.rglob("*.csv"))


def test_history_requires_every_cached_file(couk_cache: Path) -> None:
    src = FootballDataCoUk(cache_dir=couk_cache, today=FIXTURE_TODAY, leagues=("PL", "PD"))
    with pytest.raises(HistoryDataError, match="not cached"):
        src.history()


def test_cli_history_fetch_prints_counts(couk_cache: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(FootballDataCoUk, "fetch", lambda self, refresh=False: [])
    result = CliRunner().invoke(
        app,
        [
            "history",
            "fetch",
            "--cache-dir",
            str(couk_cache),
            "--today",
            "2016-05-01",
            "--league",
            "PL",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "2014-15" in result.output and "2015-16" in result.output
    assert "24 matches" in result.output
    written = pd.read_csv(couk_cache / "matches.csv")
    assert len(written) == 24
