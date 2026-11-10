"""The production model for a daily run, fitted on all history before today: the backtested
Dixon-Coles + Elo blend, then the shot stacker on top (``dc-elo-sot-0.2.0``, Part 18).

* Elo ratings are the ratings after each team's last match in the history.
* The Elo→1X2 ordered logit and Dixon-Coles are fitted per league, Dixon-Coles with
  ``reference_date = before`` (time decay and window as in the backtest).
* A side unknown to Dixon-Coles falls back to Elo only (``dc_used`` is ``False``). A side with
  no Elo rating gets no prediction at all; the caller must drop and report that match.
* The stacker is trained exactly as in the backtest: on walk-forward (out-of-sample) blend
  probabilities of every earlier month plus pre-match shot rates. A side with no shot
  statistics yet keeps the blend (``stack_used`` is ``False``); the caller flags it.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from betadvisor.backtest.predict import DC_COLS, ELO_COLS, PredictConfig, walk_forward_predictions
from betadvisor.features._order import chronological
from betadvisor.features.elo import DEFAULT_ELO, EloConfig, elo_ratings
from betadvisor.features.form import FORM_LENGTH, result_letter
from betadvisor.features.shots import (
    SHOT_DECAY,
    SHOT_RATE_COLUMNS,
    ShotRate,
    current_shot_rates,
    shot_rates,
)
from betadvisor.ingest.base import MatchResult
from betadvisor.ingest.football_data_couk import current_season_start, season_label
from betadvisor.models.blend import LIVE_BLEND_WEIGHT_DC, blend
from betadvisor.models.dixon_coles import (
    DEFAULT_DC,
    DixonColesConfig,
    DixonColesParams,
    fit_dixon_coles,
)
from betadvisor.models.elo_1x2 import OrderedLogit, fit_ordered_logit, outcome_index
from betadvisor.models.stack import STACK_VERSION, ShotStacker, features, fit_stacker

Selection = Literal["HOME", "DRAW", "AWAY"]
MIN_LEAGUE_MATCHES = 200
MIN_STACK_ROWS = 1000
HISTORY_KEY = ["league", "season", "home_code", "away_code"]


@dataclass(frozen=True, slots=True)
class Prediction:
    probs: dict[Selection, float]
    dc_used: bool
    stack_used: bool


@dataclass(frozen=True, slots=True)
class LiveModel:
    before: date
    ratings: dict[str, float]
    logits: dict[str, OrderedLogit]
    dc: dict[str, DixonColesParams]
    forms: dict[str, str]
    stacker: ShotStacker
    shots: dict[str, ShotRate]
    weight_dc: float = LIVE_BLEND_WEIGHT_DC
    version: str = STACK_VERSION

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
        stacker = fit_live_stacker(data, elo, dc)
        return cls(
            before,
            ratings,
            logits,
            params,
            current_forms(data),
            stacker,
            current_shot_rates(data, SHOT_DECAY),
        )

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
        h, a = self.shots.get(home), self.shots.get(away)
        stack_used = h is not None and a is not None
        if h is not None and a is not None:
            rates = np.array([[h.sot_for, h.sot_against, a.sot_for, a.sot_against]])
            p = self.stacker.probs(features(p.reshape(1, 3), rates))[0]
        probs: dict[Selection, float] = {
            "HOME": float(p[0]),
            "DRAW": float(p[1]),
            "AWAY": float(p[2]),
        }
        return Prediction(probs, dc_used, stack_used)

    def form(self, team: str) -> str:
        return self.forms.get(team, "")


def fit_live_stacker(
    data: pd.DataFrame, elo: EloConfig = DEFAULT_ELO, dc: DixonColesConfig = DEFAULT_DC
) -> ShotStacker:
    """The shot stacker on every walk-forward row of ``data`` (as in the backtest)."""
    seasons = sorted(set(data["season"]))
    preds = walk_forward_predictions(
        data, seasons, PredictConfig(min_train_matches=MIN_LEAGUE_MATCHES, dc=dc, elo=elo)
    )
    dc_p = preds[DC_COLS].to_numpy(dtype=np.float64)
    elo_p = preds[ELO_COLS].to_numpy(dtype=np.float64)
    has_dc = np.isfinite(dc_p).all(axis=1)
    mixed = elo_p.copy()
    mixed[has_dc] = blend(dc_p[has_dc], elo_p[has_dc], LIVE_BLEND_WEIGHT_DC)
    rates = shot_rates(data, SHOT_DECAY).loc[preds.index, SHOT_RATE_COLUMNS]
    x = features(mixed, rates.to_numpy(dtype=np.float64))
    ok = np.isfinite(x).all(axis=1)
    outcome = preds["outcome"].to_numpy(dtype=np.int64)
    return fit_stacker(x[ok], outcome[ok], MIN_STACK_ROWS)


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
