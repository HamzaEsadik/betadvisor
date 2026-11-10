"""Second-stage walk-forward: trained only on earlier months, fallback where data is missing."""

from __future__ import annotations

import numpy as np
import pandas as pd

from betadvisor.backtest.candidates import (
    BOOSTED_COLS,
    STACK_COLS,
    StageTwoConfig,
    add_shot_rates,
    stage_two_predictions,
)
from betadvisor.backtest.predict import (
    DC_COLS,
    ELO_COLS,
    PredictConfig,
    walk_forward_predictions,
)
from betadvisor.backtest.run import BLEND_COLS
from tests.models.synthetic import simulate_league

SEASONS = ["2014-15", "2015-16", "2016-17"]
CONFIG = StageTwoConfig(min_train_rows=150)


def staged(matches: pd.DataFrame) -> pd.DataFrame:
    preds = walk_forward_predictions(matches, SEASONS, PredictConfig(min_train_matches=50))
    dc = preds[DC_COLS].to_numpy()
    elo = preds[ELO_COLS].to_numpy()
    preds[BLEND_COLS] = np.where(np.isfinite(dc), 0.5 * dc + 0.5 * elo, elo)
    blended = add_shot_rates(preds, matches)
    return stage_two_predictions(blended, BLEND_COLS, ["2016-17"], CONFIG)


def test_stage_two_predicts_normalized_probabilities() -> None:
    matches, _, _, _ = simulate_league(seasons=3, n_teams=10)
    out = staged(matches)
    assert set(out["season"]) == {"2016-17"}
    assert not out["stage2_fallback"].all()
    for cols in (STACK_COLS, BOOSTED_COLS):
        np.testing.assert_allclose(out[cols].to_numpy().sum(axis=1), 1.0, atol=1e-9)


def test_stage_two_ignores_future_matches() -> None:
    """Changing every result and shot count from a cutoff on leaves earlier predictions alone."""
    matches, _, _, _ = simulate_league(seasons=3, n_teams=10)
    cutoff = pd.Timestamp("2016-11-01")
    later = matches["date"] >= cutoff
    changed = matches.copy()
    changed.loc[later, ["home_goals", "away_goals"]] = changed.loc[
        later, ["away_goals", "home_goals"]
    ].to_numpy()
    changed.loc[later, ["home_shots_target", "away_shots_target"]] = 0.0
    a, b = staged(matches), staged(changed)
    before = a["date"] < cutoff
    assert before.any()
    cols = STACK_COLS + BOOSTED_COLS
    np.testing.assert_allclose(
        a.loc[before, cols].to_numpy(), b.loc[before, cols].to_numpy(), rtol=1e-9
    )


def test_missing_shots_fall_back_to_the_blend() -> None:
    matches, _, _, _ = simulate_league(seasons=3, n_teams=10)
    matches[["home_shots_target", "away_shots_target"]] = np.nan
    out = staged(matches)
    assert out["stage2_fallback"].all()
    np.testing.assert_allclose(out[STACK_COLS].to_numpy(), out[BLEND_COLS].to_numpy())
