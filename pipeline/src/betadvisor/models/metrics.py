"""Probabilistic scoring for 1X2 forecasts (SRS 6.7).

``probs`` is an ``(n, 3)`` array of ``(home, draw, away)`` and ``outcome`` holds 0, 1 or 2.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]

_EPS = 1e-15


def _check(probs: FloatArray, outcome: IntArray) -> None:
    if probs.ndim != 2 or probs.shape[1] != 3:
        raise ValueError(f"probs must be (n, 3), got {probs.shape}")
    if len(probs) != len(outcome):
        raise ValueError("probs and outcome lengths differ")
    if len(probs) == 0:
        raise ValueError("no forecasts to score")


def log_loss(probs: FloatArray, outcome: IntArray) -> float:
    """Mean negative log probability of the observed outcome."""
    _check(probs, outcome)
    p = probs[np.arange(len(outcome)), outcome]
    return float(-np.log(np.clip(p, _EPS, 1.0)).mean())


def brier(probs: FloatArray, outcome: IntArray) -> float:
    """Multi-class Brier score: mean over matches of ``Σ_k (p_k − o_k)²`` (0 best, 2 worst)."""
    _check(probs, outcome)
    onehot = np.eye(3)[outcome]
    return float(((probs - onehot) ** 2).sum(axis=1).mean())


@dataclass(frozen=True, slots=True)
class CalibrationBin:
    lower: float
    upper: float
    count: int
    mean_predicted: float | None
    observed: float | None


def calibration_bins(
    probs: FloatArray, outcome: IntArray, n_bins: int = 10
) -> list[CalibrationBin]:
    """Every (match, outcome) probability pooled into equal-width bins, with the observed rate."""
    _check(probs, outcome)
    p = probs.ravel()
    hit = np.eye(3)[outcome].ravel()
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    which = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    out: list[CalibrationBin] = []
    for b in range(n_bins):
        mask = which == b
        n = int(mask.sum())
        out.append(
            CalibrationBin(
                lower=float(edges[b]),
                upper=float(edges[b + 1]),
                count=n,
                mean_predicted=float(p[mask].mean()) if n else None,
                observed=float(hit[mask].mean()) if n else None,
            )
        )
    return out
