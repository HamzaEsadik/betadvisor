"""Weighted blend of the Dixon-Coles and Elo 1X2 probabilities.

``p = w × p_dc + (1 − w) × p_elo``. The weight is picked on validation seasons only (never on
the seasons that are reported), by a grid search on log loss.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from betadvisor.models.metrics import log_loss

FloatArray = npt.NDArray[np.float64]

MODEL_VERSION = "dc-elo-0.1.0"
WEIGHT_GRID: tuple[float, ...] = tuple(round(i * 0.05, 2) for i in range(21))


def blend(dc: FloatArray, elo: FloatArray, weight: float) -> FloatArray:
    if not 0 <= weight <= 1:
        raise ValueError(f"blend weight must be in [0, 1], got {weight}")
    if dc.shape != elo.shape:
        raise ValueError(f"shape mismatch: {dc.shape} vs {elo.shape}")
    return np.asarray(weight * dc + (1 - weight) * elo, dtype=np.float64)


def choose_weight(
    dc: FloatArray,
    elo: FloatArray,
    outcome: npt.NDArray[np.int64],
    grid: tuple[float, ...] = WEIGHT_GRID,
) -> float:
    """The grid weight with the lowest validation log loss (ties go to the smaller weight)."""
    if len(outcome) == 0:
        raise ValueError("cannot choose a blend weight on zero validation matches")
    losses = [log_loss(blend(dc, elo, w), outcome) for w in grid]
    return grid[int(np.argmin(losses))]
