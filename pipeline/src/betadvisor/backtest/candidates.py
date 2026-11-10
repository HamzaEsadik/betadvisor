"""Walk-forward second-stage models (Part 18): the stacker and the boosted model.

For each calendar month of the evaluated seasons, both models are fitted on the walk-forward
rows dated before that month (whose blend probabilities are themselves out of sample) and
predict that month. Rows without shot rates, and months with too few training rows, keep the
blend; ``stage2_fallback`` marks them and the report counts them.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from betadvisor.backtest.splits import walk_forward
from betadvisor.features.shots import SHOT_DECAY, SHOT_RATE_COLUMNS, shot_rates
from betadvisor.models.stack import (
    DEFAULT_BOOSTED,
    BoostedConfig,
    complete_rows,
    features,
    fit_boosted,
    fit_stacker,
)

STACK_COLS = ["stack_home", "stack_draw", "stack_away"]
BOOSTED_COLS = ["gb_home", "gb_draw", "gb_away"]


@dataclass(frozen=True, slots=True)
class StageTwoConfig:
    min_train_rows: int = 1000
    shot_decay: float = SHOT_DECAY
    boosted: BoostedConfig = DEFAULT_BOOSTED


DEFAULT_STAGE_TWO = StageTwoConfig()


def add_shot_rates(
    preds: pd.DataFrame, history: pd.DataFrame, decay: float = SHOT_DECAY
) -> pd.DataFrame:
    """``preds`` (rows of ``history``, same index) plus the pre-match shot-rate columns."""
    rates = shot_rates(history, decay)
    return preds.join(rates.loc[preds.index])


def stage_two_predictions(
    preds: pd.DataFrame,
    blend_cols: list[str],
    seasons: list[str],
    config: StageTwoConfig = DEFAULT_STAGE_TWO,
) -> pd.DataFrame:
    """Rows of ``preds`` in ``seasons`` with ``STACK_COLS``, ``BOOSTED_COLS`` and
    ``stage2_fallback``. ``preds`` must hold every earlier walk-forward row (training data)."""
    x_all = features(
        preds[blend_cols].to_numpy(dtype=np.float64),
        preds[SHOT_RATE_COLUMNS].to_numpy(dtype=np.float64),
    )
    ok_all = complete_rows(x_all)
    outcome_all = preds["outcome"].to_numpy(dtype=np.int64)
    positions = pd.Series(np.arange(len(preds)), index=preds.index)

    out = preds[preds["season"].isin(seasons)].copy()
    blend = out[blend_cols].to_numpy(dtype=np.float64)
    out[STACK_COLS] = blend
    out[BOOSTED_COLS] = blend
    out["stage2_fallback"] = True

    for _window, train, test in walk_forward(preds, preds["season"].isin(seasons)):
        tr = positions.loc[train.index].to_numpy()
        tr = tr[ok_all[tr]]
        if len(tr) < config.min_train_rows:
            continue
        te = positions.loc[test.index].to_numpy()
        te = te[ok_all[te]]
        if len(te) == 0:
            continue
        stacker = fit_stacker(x_all[tr], outcome_all[tr], config.min_train_rows)
        boosted = fit_boosted(
            x_all[tr],
            outcome_all[tr],
            preds["date"].iloc[tr],
            config.boosted,
            config.min_train_rows,
        )
        idx = preds.index[te]
        out.loc[idx, STACK_COLS] = stacker.probs(x_all[te])
        out.loc[idx, BOOSTED_COLS] = boosted.probs(x_all[te])
        out.loc[idx, "stage2_fallback"] = False
    return out
