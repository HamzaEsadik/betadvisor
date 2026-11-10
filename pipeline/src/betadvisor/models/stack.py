"""Second-stage models on top of the Dixon-Coles + Elo blend (Part 18, M5).

Both read the blend's out-of-sample 1X2 probabilities plus the teams' shots-on-target rates
(``features.shots``) and output new 1X2 probabilities. They must be trained on blend
probabilities that were themselves predicted out of sample (walk-forward rows), never on
in-sample fits, or they learn to trust an over-confident blend.

* ``ShotStacker`` (``dc-elo-sot-0.2.0``): multinomial logistic regression on standardized
  features, L2 penalty ``C = 1``. Stored as plain arrays, so prediction needs only numpy.
* ``BoostedModel`` (``gb-cal-0.2.0``): scikit-learn ``HistGradientBoostingClassifier`` fitted on
  the earlier part of the training rows, then Platt-calibrated (multinomial logistic regression
  on the log probabilities) on the most recent ``calibration_share`` of them, a held-out time
  slice.

Feature rows with a missing value (a team with no shot statistics yet) cannot be scored; the
caller falls back to the blend and counts or flags it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

from betadvisor.features.shots import SHOT_RATE_COLUMNS

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]

STACK_VERSION = "dc-elo-sot-0.2.0"
BOOSTED_VERSION = "gb-cal-0.2.0"
FEATURE_NAMES = ["logit_home_away", "logit_draw", *SHOT_RATE_COLUMNS]
_EPS = 1e-12


def features(blend: FloatArray, shots: FloatArray) -> FloatArray:
    """Rows of ``FEATURE_NAMES`` from blend probabilities (n, 3) and shot rates (n, 4)."""
    p = np.clip(np.asarray(blend, dtype=np.float64), _EPS, 1.0)
    s = np.asarray(shots, dtype=np.float64)
    if p.ndim != 2 or p.shape[1] != 3 or s.shape != (len(p), 4):
        raise ValueError(f"expected (n, 3) and (n, 4) arrays, got {p.shape} and {s.shape}")
    return np.column_stack(
        [np.log(p[:, 0] / p[:, 2]), np.log(p[:, 1] / (1.0 - p[:, 1])), s]
    ).astype(np.float64)


def complete_rows(x: FloatArray) -> npt.NDArray[np.bool_]:
    return np.asarray(np.isfinite(x).all(axis=1), dtype=np.bool_)


def _check_training(x: FloatArray, outcome: IntArray, min_rows: int) -> None:
    if len(x) != len(outcome):
        raise ValueError(f"{len(x)} feature rows but {len(outcome)} outcomes")
    if not complete_rows(x).all():
        raise ValueError("training rows contain missing features; drop them first")
    if len(x) < min_rows:
        raise ValueError(f"only {len(x)} training rows, need {min_rows}")
    if set(np.unique(outcome).tolist()) != {0, 1, 2}:
        raise ValueError("training outcomes must include home wins, draws and away wins")


def _softmax(z: FloatArray) -> FloatArray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    out: FloatArray = e / e.sum(axis=1, keepdims=True)
    return out


@dataclass(frozen=True, slots=True)
class ShotStacker:
    mean: FloatArray
    scale: FloatArray
    coef: FloatArray  # (3, n_features)
    intercept: FloatArray  # (3,)

    def probs(self, x: FloatArray) -> FloatArray:
        if not complete_rows(x).all():
            raise ValueError("cannot score rows with missing features")
        z = ((x - self.mean) / self.scale) @ self.coef.T + self.intercept
        return _softmax(z)


def fit_stacker(
    x: FloatArray, outcome: IntArray, min_rows: int = 1000, c: float = 1.0
) -> ShotStacker:
    _check_training(x, outcome, min_rows)
    mean = x.mean(axis=0)
    scale = x.std(axis=0)
    scale[scale == 0] = 1.0
    lr = LogisticRegression(C=c, max_iter=1000)
    lr.fit((x - mean) / scale, outcome)
    return ShotStacker(
        mean=mean.astype(np.float64),
        scale=scale.astype(np.float64),
        coef=np.asarray(lr.coef_, dtype=np.float64),
        intercept=np.asarray(lr.intercept_, dtype=np.float64),
    )


@dataclass(frozen=True, slots=True)
class BoostedConfig:
    max_iter: int = 100
    learning_rate: float = 0.03
    max_depth: int = 2
    min_samples_leaf: int = 300
    l2_regularization: float = 5.0
    calibration_share: float = 0.2
    seed: int = 0

    def __post_init__(self) -> None:
        if not 0 < self.calibration_share < 1:
            raise ValueError(f"calibration_share must be in (0, 1), got {self.calibration_share}")


DEFAULT_BOOSTED = BoostedConfig()


@dataclass(frozen=True, slots=True)
class BoostedModel:
    model: HistGradientBoostingClassifier
    platt: LogisticRegression

    def probs(self, x: FloatArray) -> FloatArray:
        if not complete_rows(x).all():
            raise ValueError("cannot score rows with missing features")
        raw = np.clip(self.model.predict_proba(x), _EPS, 1.0)
        return np.asarray(self.platt.predict_proba(np.log(raw)), dtype=np.float64)


def fit_boosted(
    x: FloatArray,
    outcome: IntArray,
    dates: pd.Series,
    config: BoostedConfig = DEFAULT_BOOSTED,
    min_rows: int = 1000,
) -> BoostedModel:
    """Boosting on the older rows, Platt calibration on the newest ``calibration_share``."""
    _check_training(x, outcome, min_rows)
    order = np.argsort(dates.to_numpy(), kind="stable")
    n_cal = max(1, int(round(len(order) * config.calibration_share)))
    fit_idx, cal_idx = order[:-n_cal], order[-n_cal:]
    gb = HistGradientBoostingClassifier(
        max_iter=config.max_iter,
        learning_rate=config.learning_rate,
        max_depth=config.max_depth,
        min_samples_leaf=min(config.min_samples_leaf, max(1, len(fit_idx) // 10)),
        l2_regularization=config.l2_regularization,
        early_stopping=False,
        random_state=config.seed,
    )
    gb.fit(x[fit_idx], outcome[fit_idx])
    if len(np.unique(outcome[cal_idx])) != 3 or len(np.unique(outcome[fit_idx])) != 3:
        raise ValueError("both time slices need home wins, draws and away wins")
    raw = np.clip(gb.predict_proba(x[cal_idx]), _EPS, 1.0)
    platt = LogisticRegression(C=1e6, max_iter=1000)
    platt.fit(np.log(raw), outcome[cal_idx])
    return BoostedModel(gb, platt)
