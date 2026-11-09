"""Elo difference to 1X2 probabilities with an ordered logit.

With ``x = (home_elo − away_elo) / 100`` (pre-match ratings, see ``features.elo``):

    P(away)          = σ(c1 − βx)
    P(away or draw)  = σ(c2 − βx),   c1 < c2
    P(home)          = 1 − σ(c2 − βx)

Home advantage is absorbed by the cut points. ``c2 = c1 + exp(δ)`` keeps them ordered, and
``(β, c1, δ)`` are fitted by maximum likelihood on past matches.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit

FloatArray = npt.NDArray[np.float64]

ELO_SCALE = 100.0
_EPS = 1e-12


@dataclass(frozen=True, slots=True)
class OrderedLogit:
    beta: float
    c1: float
    c2: float

    def probs(self, elo_diff: FloatArray) -> FloatArray:
        """``(n, 3)`` array of ``(P(home), P(draw), P(away))`` for each Elo difference."""
        x = np.asarray(elo_diff, dtype=np.float64) / ELO_SCALE
        away = expit(self.c1 - self.beta * x)
        away_or_draw = expit(self.c2 - self.beta * x)
        out = np.column_stack([1 - away_or_draw, away_or_draw - away, away])
        return np.asarray(out, dtype=np.float64)


def outcome_index(home_goals: pd.Series, away_goals: pd.Series) -> npt.NDArray[np.int64]:
    """0 for a home win, 1 for a draw, 2 for an away win."""
    hg = home_goals.to_numpy(dtype=np.int64)
    ag = away_goals.to_numpy(dtype=np.int64)
    return np.where(hg > ag, 0, np.where(hg == ag, 1, 2)).astype(np.int64)


def _unpack(theta: FloatArray) -> OrderedLogit:
    beta, c1, delta = (float(v) for v in theta)
    return OrderedLogit(beta=beta, c1=c1, c2=c1 + float(np.exp(delta)))


def fit_ordered_logit(elo_diff: FloatArray, outcome: npt.NDArray[np.int64]) -> OrderedLogit:
    """Maximum-likelihood ordered logit of outcome (0 home, 1 draw, 2 away) on Elo difference."""
    if len(elo_diff) != len(outcome):
        raise ValueError("elo_diff and outcome lengths differ")
    if len(set(outcome.tolist())) < 3:
        raise ValueError("need at least one home win, draw and away win to fit the ordered logit")
    rows = np.arange(len(outcome))

    def neg_ll(theta: FloatArray) -> float:
        p = _unpack(theta).probs(elo_diff)[rows, outcome]
        return float(-np.log(np.maximum(p, _EPS)).sum())

    result = minimize(
        neg_ll,
        np.array([0.5, -0.8, 0.0]),
        method="Nelder-Mead",
        options={"xatol": 1e-7, "fatol": 1e-9, "maxiter": 5000},
    )
    if not result.success:
        raise RuntimeError(f"ordered logit fit did not converge: {result.message}")
    return _unpack(np.asarray(result.x, dtype=np.float64))
