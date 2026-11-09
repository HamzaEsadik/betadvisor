"""Bookmaker margin removal (SRS 6.1, FR-D4).

Proportional is the default. Shin's method is available behind ``method="shin"``: it assigns
more of the margin to long shots (favourite/long-shot bias), which suits 1X2 markets better.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from scipy.optimize import brentq

from betadvisor.decision.config import DevigMethod


def _raw_probs(odds: Sequence[float]) -> list[float]:
    if len(odds) < 2:
        raise ValueError(f"need at least 2 outcomes to remove a margin, got {len(odds)}")
    for o in odds:
        if not math.isfinite(o) or o <= 1:
            raise ValueError(f"decimal odds must be finite and > 1, got {o}")
    return [1.0 / o for o in odds]


def overround(odds: Sequence[float]) -> float:
    """Sum of the raw implied probabilities ``Σ 1/o_i``. Above 1 means a bookmaker margin."""
    return math.fsum(_raw_probs(odds))


def proportional(odds: Sequence[float]) -> list[float]:
    """``implied_i = (1/o_i) / Σ(1/o_j)`` (SRS 6.1)."""
    raw = _raw_probs(odds)
    total = math.fsum(raw)
    return [r / total for r in raw]


def _shin_probs(raw: Sequence[float], total: float, z: float) -> list[float]:
    return [(math.sqrt(z * z + 4 * (1 - z) * r * r / total) - z) / (2 * (1 - z)) for r in raw]


def shin(odds: Sequence[float]) -> list[float]:
    """Shin (1993) implied probabilities, solving for the insider share ``z`` numerically.

    A book with no margin (overround <= 1, e.g. best prices across bookmakers) has ``z = 0``
    and no insider margin to remove, so it is normalised proportionally.
    """
    raw = _raw_probs(odds)
    total = math.fsum(raw)
    if total <= 1:
        return [r / total for r in raw]

    def excess(z: float) -> float:
        return math.fsum(_shin_probs(raw, total, z)) - 1

    z = brentq(excess, 0.0, 0.999, xtol=1e-15)
    probs = _shin_probs(raw, total, float(z))
    s = math.fsum(probs)
    return [p / s for p in probs]


def implied_probabilities(
    odds: Sequence[float], method: DevigMethod = "proportional"
) -> list[float]:
    """Margin-free implied probabilities, in the same order as ``odds``."""
    if method == "proportional":
        return proportional(odds)
    if method == "shin":
        return shin(odds)
    raise ValueError(f"unknown devig method {method!r}")
