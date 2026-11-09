"""The production model for a daily run: the backtested Dixon-Coles + Elo blend, fitted on all
history before today.

* Elo ratings are the ratings after each team's last match in the history.
* The Elo→1X2 ordered logit and Dixon-Coles are fitted per league, Dixon-Coles with
  ``reference_date = before`` (time decay and window as in the backtest).
* A side unknown to Dixon-Coles falls back to Elo only (``dc_used`` is ``False``). A side with
  no Elo rating gets no prediction at all; the caller must drop and report that match.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from betadvisor.features._order import chronological
from betadvisor.features.elo import DEFAULT_ELO, EloConfig, elo_ratings
from betadvisor.features.form import FORM_LENGTH, result_letter
from betadvisor.ingest.base import MatchResult
from betadvisor.ingest.football_data_couk import current_season_start, season_label
from betadvisor.models.blend import LIVE_BLEND_WEIGHT_DC, MODEL_VERSION
from betadvisor.models.dixon_coles import (
    DEFAULT_DC,
    DixonColesConfig,
    DixonColesParams,
    fit_dixon_coles,
)
from betadvisor.models.elo_1x2 import OrderedLogit, fit_ordered_logit, outcome_index

Selection = Literal["HOME", "DRAW", "AWAY"]
MIN_LEAGUE_MATCHES = 200
HISTORY_KEY = ["league", "season", "home_code", "away_code"]


@dataclass(frozen=True, slots=True)
class Prediction:
    probs: dict[Selection, float]
    dc_used: bool


@dataclass(frozen=True, slots=True)
class LiveModel:
    before: date
    ratings: dict[str, float]
    logits: dict[str, OrderedLogit]
    dc: dict[str, DixonColesParams]
    forms: dict[str, str]
    weight_dc: float = LIVE_BLEND_WEIGHT_DC
    version: str = MODEL_VERSION

    @classmethod
    def fit(
        cls,
        history: pd.DataFrame,
        before: date,
        elo: EloConfig = DEFAULT_ELO,
        dc: DixonColesConfig = DEFAULT_DC,
    ) -> LiveModel:
        """Fit on matches dated strictly before ``before`` (Dixon-Coles reference date)."""
        data = history[history["date"] < pd.Timestamp(before)].copy()
        if data.empty:
            raise ValueError(f"no history before {before}")
        data["outcome"] = outcome_index(data["home_goals"], data["away_goals"])
        pre, ratings = elo_ratings(data, elo)
        data["elo_diff"] = pre["home_elo"] - pre["away_elo"]

        logits: dict[str, OrderedLogit] = {}
        params: dict[str, DixonColesParams] = {}
        for league, rows in data.groupby("league", sort=True):
            if len(rows) < MIN_LEAGUE_MATCHES:
                raise ValueError(f"{league}: only {len(rows)} matches of history")
            logits[str(league)] = fit_ordered_logit(
                rows["elo_diff"].to_numpy(dtype=np.float64),
                rows["outcome"].to_numpy(dtype=np.int64),
            )
            params[str(league)] = fit_dixon_coles(rows, pd.Timestamp(before), dc)
        return cls(before, ratings, logits, params, current_forms(data))

    def predict(self, league: str, home: str, away: str) -> Prediction | None:
        if league not in self.logits or home not in self.ratings or away not in self.ratings:
            return None
        diff = np.array([self.ratings[home] - self.ratings[away]], dtype=np.float64)
        elo = self.logits[league].probs(diff)[0]
        dc = self.dc[league]
        dc_used = dc.knows(home) and dc.knows(away)
        if dc_used:
            p = self.weight_dc * np.array(dc.probs_1x2(home, away)) + (1 - self.weight_dc) * elo
        else:
            p = elo
        p = p / p.sum()
        return Prediction({"HOME": float(p[0]), "DRAW": float(p[1]), "AWAY": float(p[2])}, dc_used)

    def form(self, team: str) -> str:
        return self.forms.get(team, "")


def current_forms(matches: pd.DataFrame, length: int = FORM_LENGTH) -> dict[str, str]:
    """Each team's last ``length`` results after all of ``matches``, newest on the right."""
    history: dict[str, deque[str]] = {}
    ordered = chronological(matches)
    rows = zip(
        ordered["home_code"],
        ordered["away_code"],
        ordered["home_goals"],
        ordered["away_goals"],
        strict=True,
    )
    for home, away, hg, ag in rows:
        history.setdefault(home, deque(maxlen=length)).append(result_letter(hg, ag))
        history.setdefault(away, deque(maxlen=length)).append(result_letter(ag, hg))
    return {team: "".join(res) for team, res in history.items()}


def merge_recent_results(history: pd.DataFrame, results: list[MatchResult]) -> pd.DataFrame:
    """History plus finished matches it does not have yet (football-data.co.uk lags a few days).

    A match is identified by league, season and the two teams (each pairing is played once per
    season), so the same match never appears twice even if the two sources disagree on date.
    """
    rows = []
    for r in results:
        if r.status != "finished" or r.home_goals is None or r.away_goals is None:
            continue
        day = r.kickoff_at.date()
        rows.append(
            {
                "season": season_label(current_season_start(day)),
                "league": r.league,
                "date": pd.Timestamp(day),
                "home_code": r.home_code,
                "away_code": r.away_code,
                "home_goals": r.home_goals,
                "away_goals": r.away_goals,
            }
        )
    if not rows:
        return history
    recent = pd.DataFrame(rows)
    known = history.set_index(HISTORY_KEY).index
    new = recent[~recent.set_index(HISTORY_KEY).index.isin(known)]
    if new.empty:
        return history
    merged = pd.concat([history, new], ignore_index=True)
    return merged.sort_values(["date", "league", "home_code"], kind="stable").reset_index(drop=True)
