"""History adapter for football-data.co.uk season CSVs (E0, SP1, D1, F1).

Raw files are cached as ``<cache>/<season code>/<division>.csv`` (e.g. ``1415/E0.csv``). Past
seasons are downloaded once; the current season is re-downloaded on every fetch because it grows
week by week. :func:`normalize` turns one raw file into the history table described by
``HISTORY_COLUMNS``; team names become codes from ``teams.csv`` and unknown names raise.

Kick-off ``time`` (present from 2019-20) is UK local time as published; it is kept as text and
not used by the features, which only need the match date.
"""

from __future__ import annotations

import io
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Protocol

import pandas as pd
import requests

from betadvisor.ingest.base import LEAGUE_CODES, LeagueCode
from betadvisor.teams import TeamRegistry, default_registry

SOURCE = "couk"
BASE_URL = "https://www.football-data.co.uk/mmz4281"
FIRST_SEASON = 2014
REQUEST_TIMEOUT_S = 60

DIVISIONS: dict[LeagueCode, str] = {"PL": "E0", "PD": "SP1", "BL1": "D1", "FL1": "F1"}

HISTORY_COLUMNS: tuple[str, ...] = (
    "season",  # "2014-15"
    "league",  # PL | PD | BL1 | FL1
    "date",  # match date (datetime64, midnight)
    "time",  # "HH:MM" UK time, or missing before 2019-20
    "home_code",
    "away_code",
    "home_goals",
    "away_goals",
    "avg_home",  # market average 1X2 odds (Avg* or BbAv*)
    "avg_draw",
    "avg_away",
    "ps_home",  # Pinnacle 1X2 odds
    "ps_draw",
    "ps_away",
    "avg_close_home",  # market average closing odds (from 2019-20)
    "avg_close_draw",
    "avg_close_away",
    "ps_close_home",  # Pinnacle closing odds
    "ps_close_draw",
    "ps_close_away",
)

# Normalized odds column -> raw columns to try, first match wins.
_ODDS_SOURCES: dict[str, tuple[str, ...]] = {
    "avg_home": ("AvgH", "BbAvH"),
    "avg_draw": ("AvgD", "BbAvD"),
    "avg_away": ("AvgA", "BbAvA"),
    "ps_home": ("PSH",),
    "ps_draw": ("PSD",),
    "ps_away": ("PSA",),
    "avg_close_home": ("AvgCH",),
    "avg_close_draw": ("AvgCD",),
    "avg_close_away": ("AvgCA",),
    "ps_close_home": ("PSCH",),
    "ps_close_draw": ("PSCD",),
    "ps_close_away": ("PSCA",),
}
_REQUIRED_RAW = ("Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG")


class HistoryDataError(ValueError):
    """A raw history file is missing, malformed or inconsistent."""


class HttpGetter(Protocol):
    def get(self, url: str, *, timeout: float) -> requests.Response: ...


def season_label(start_year: int) -> str:
    """2014 -> ``"2014-15"``."""
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def season_code(start_year: int) -> str:
    """2014 -> ``"1415"`` (the folder name used by football-data.co.uk)."""
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def current_season_start(today: date) -> int:
    """European seasons start in July or August: before July we are still in last year's."""
    return today.year if today.month >= 7 else today.year - 1


def seasons_up_to(today: date, first: int = FIRST_SEASON) -> list[int]:
    return list(range(first, current_season_start(today) + 1))


def decode_csv(raw: bytes) -> str:
    """Older files are Windows-1252; newer ones UTF-8 with a BOM."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def normalize(
    csv_text: str,
    league: LeagueCode,
    season_start: int,
    registry: TeamRegistry | None = None,
) -> pd.DataFrame:
    """Turn one raw season CSV into rows of the history table, sorted by date."""
    registry = registry or default_registry()
    where = f"{season_code(season_start)}/{DIVISIONS[league]}.csv"
    raw = pd.read_csv(io.StringIO(csv_text), dtype=str, keep_default_na=False)
    raw.columns = [c.strip() for c in raw.columns]
    missing = [c for c in _REQUIRED_RAW if c not in raw.columns]
    if missing:
        raise HistoryDataError(f"{where}: missing columns {missing}")

    # Trailing blank lines show up as rows with no teams.
    raw = raw[(raw["HomeTeam"].str.strip() != "") | (raw["AwayTeam"].str.strip() != "")]
    if raw.empty:
        raise HistoryDataError(f"{where}: no matches")
    wrong_div = raw.loc[raw["Div"].str.strip() != DIVISIONS[league], "Div"].unique()
    if len(wrong_div):
        raise HistoryDataError(f"{where}: unexpected division(s) {list(wrong_div)}")

    names = sorted(set(raw["HomeTeam"].str.strip()) | set(raw["AwayTeam"].str.strip()))
    codes = registry.codes_for(SOURCE, names)

    dates = pd.to_datetime(raw["Date"].str.strip(), format="%d/%m/%Y", errors="coerce")
    short = dates.isna()
    dates[short] = pd.to_datetime(raw.loc[short, "Date"].str.strip(), format="%d/%m/%y")
    out = pd.DataFrame(
        {
            "season": season_label(season_start),
            "league": league,
            "date": dates.astype("datetime64[ns]"),
            "time": _blank_to_na(raw["Time"]) if "Time" in raw else pd.NA,
            "home_code": raw["HomeTeam"].str.strip().map(codes),
            "away_code": raw["AwayTeam"].str.strip().map(codes),
            "home_goals": _goals(raw["FTHG"], where),
            "away_goals": _goals(raw["FTAG"], where),
        }
    )
    for column, candidates in _ODDS_SOURCES.items():
        src = next((c for c in candidates if c in raw.columns), None)
        out[column] = _numeric(raw[src], f"{where} {src}") if src else float("nan")

    out = out.astype({"time": "string"})
    # Seasons run Aug to May; 2019-20 was extended to late July 2020 by Covid.
    start, end = pd.Timestamp(season_start, 7, 1), pd.Timestamp(season_start + 1, 8, 15)
    outside = out[(out["date"] < start) | (out["date"] >= end)]
    if not outside.empty:
        raise HistoryDataError(f"{where}: {len(outside)} match date(s) outside the season")
    dupes = out.duplicated(["home_code", "away_code"])
    if dupes.any():
        raise HistoryDataError(f"{where}: {int(dupes.sum())} duplicated fixture(s)")
    return out.sort_values(["date", "home_code"], kind="stable").reset_index(drop=True)


def _blank_to_na(col: pd.Series) -> pd.Series:
    stripped = col.astype(str).str.strip()
    return stripped.where(stripped != "")


def _numeric(col: pd.Series, where: str) -> pd.Series:
    """Floats, with blanks as NaN; any other non-number fails the load."""
    try:
        return pd.Series(pd.to_numeric(_blank_to_na(col), errors="raise"), dtype=float)
    except ValueError as exc:
        raise HistoryDataError(f"{where}: {exc}") from None


def _goals(col: pd.Series, where: str) -> pd.Series:
    values = pd.Series(pd.to_numeric(_blank_to_na(col), errors="coerce"), dtype=float)
    if values.isna().any():
        raise HistoryDataError(f"{where}: {int(values.isna().sum())} match(es) without a score")
    if (values < 0).any() or (values % 1 != 0).any():
        raise HistoryDataError(f"{where}: invalid goal counts")
    return values.astype("int64")


@dataclass
class FootballDataCoUk:
    """Downloads, caches and normalizes football-data.co.uk history (implements HistorySource)."""

    cache_dir: Path
    today: date
    leagues: Sequence[LeagueCode] = LEAGUE_CODES
    first_season: int = FIRST_SEASON
    registry: TeamRegistry = field(default_factory=default_registry)
    http: HttpGetter = field(default_factory=requests.Session)

    @property
    def seasons(self) -> list[int]:
        return seasons_up_to(self.today, self.first_season)

    def path_for(self, league: LeagueCode, season_start: int) -> Path:
        return self.cache_dir / season_code(season_start) / f"{DIVISIONS[league]}.csv"

    def url_for(self, league: LeagueCode, season_start: int) -> str:
        return f"{BASE_URL}/{season_code(season_start)}/{DIVISIONS[league]}.csv"

    def fetch(self, *, refresh: bool = False) -> list[Path]:
        """Download missing files (all files if ``refresh``; the current season always)."""
        current = current_season_start(self.today)
        downloaded: list[Path] = []
        for season in self.seasons:
            for league in self.leagues:
                path = self.path_for(league, season)
                if path.exists() and not refresh and season != current:
                    continue
                self._download(self.url_for(league, season), path)
                downloaded.append(path)
        return downloaded

    def _download(self, url: str, path: Path) -> None:
        resp = self.http.get(url, timeout=REQUEST_TIMEOUT_S)
        if resp.status_code != 200:
            raise HistoryDataError(f"GET {url} returned HTTP {resp.status_code}")
        text = decode_csv(resp.content)
        if not text.lstrip().startswith("Div,"):
            raise HistoryDataError(f"GET {url} did not return a football-data CSV")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(resp.content)
        tmp.replace(path)

    def history(self) -> pd.DataFrame:
        """All cached seasons and leagues as one table, in date order."""
        return concat_history(
            normalize(
                decode_csv(self._cached(league, season).read_bytes()),
                league,
                season,
                self.registry,
            )
            for season in self.seasons
            for league in self.leagues
        )

    def _cached(self, league: LeagueCode, season: int) -> Path:
        path = self.path_for(league, season)
        if not path.exists():
            raise HistoryDataError(f"{path} is not cached; run `betadvisor history fetch`")
        return path


def concat_history(frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    table = pd.concat(list(frames), ignore_index=True)
    table = table.sort_values(["date", "league", "home_code"], kind="stable")
    return table.reset_index(drop=True)[list(HISTORY_COLUMNS)]
