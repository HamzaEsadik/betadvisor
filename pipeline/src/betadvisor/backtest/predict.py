"""Walk-forward model predictions: refit every month per league on earlier matches only.

Elo ratings come from ``features.elo`` (each match uses its pre-match ratings, so they never
see the match or anything later). The Elo→1X2 ordered logit and the Dixon-Coles parameters are
refitted for every (league, month) on matches dated before that month.

A side with no Dixon-Coles parameters (a newly promoted club in its first month) gets no
Dixon-Coles probability: ``dc_*`` is NaN and the blend falls back to Elo for that match. The
backtest reports how often this happens instead of inventing parameters.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from betadvisor.backtest.splits import walk_forward
from betadvisor.features.elo import DEFAULT_ELO, EloConfig, elo_ratings
from betadvisor.models.dixon_coles import DEFAULT_DC, DixonColesConfig, fit_dixon_coles
from betadvisor.models.elo_1x2 import fit_ordered_logit, outcome_index

DC_COLS = ["dc_home", "dc_draw", "dc_away"]
ELO_COLS = ["elo_home", "elo_draw", "elo_away"]


@dataclass(frozen=True, slots=True)
class PredictConfig:
    min_train_matches: int = 200
    dc: DixonColesConfig = DEFAULT_DC
    elo: EloConfig = DEFAULT_ELO


DEFAULT_PREDICT = PredictConfig()


def with_outcome(history: pd.DataFrame) -> pd.DataFrame:
    out = history.copy()
    out["outcome"] = outcome_index(out["home_goals"], out["away_goals"])
    return out


def walk_forward_predictions(
    history: pd.DataFrame, seasons: list[str], config: PredictConfig = DEFAULT_PREDICT
) -> pd.DataFrame:
    """Predictions for every match of ``seasons`` that has enough earlier training data.

    Returns the matching history rows plus ``outcome``, ``home_elo``, ``away_elo``,
    ``dc_*`` (NaN when a side is unknown to Dixon-Coles), ``elo_*`` and ``fit_month``.
    """
    data = with_outcome(history)
    data = data.join(elo_ratings(data, config.elo)[0][["home_elo", "away_elo"]])
    data["elo_diff"] = data["home_elo"] - data["away_elo"]

    parts: list[pd.DataFrame] = []
    for _league, league_rows in data.groupby("league", sort=True):
        mask = league_rows["season"].isin(seasons)
        for window, train, test in walk_forward(league_rows, mask):
            if len(train) < config.min_train_matches or test.empty:
                continue
            logit = fit_ordered_logit(
                train["elo_diff"].to_numpy(dtype=np.float64),
                train["outcome"].to_numpy(dtype=np.int64),
            )
            dc = fit_dixon_coles(train, reference_date=window.start, config=config.dc)

            pred = test.copy()
            pred[ELO_COLS] = logit.probs(pred["elo_diff"].to_numpy(dtype=np.float64))
            dc_probs = np.full((len(pred), 3), np.nan)
            for i, (h, a) in enumerate(zip(pred["home_code"], pred["away_code"], strict=True)):
                if dc.knows(h) and dc.knows(a):
                    dc_probs[i] = dc.probs_1x2(h, a)
            pred[DC_COLS] = dc_probs
            pred["fit_month"] = window.start
            parts.append(pred)

    if not parts:
        raise ValueError(
            f"no predictions for seasons {seasons}: no league has {config.min_train_matches}+ "
            "earlier matches"
        )
    return pd.concat(parts).sort_values(["date", "league", "home_code"], kind="stable")
