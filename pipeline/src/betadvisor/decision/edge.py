"""Edge and fractional Kelly stake (SRS 6.2, 6.3, FR-D6)."""

from __future__ import annotations

import math

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig


def _check(model_prob: float, odds: float) -> None:
    if not 0 < model_prob < 1:
        raise ValueError(f"model_prob must be in (0, 1), got {model_prob}")
    if not math.isfinite(odds) or odds <= 1:
        raise ValueError(f"decimal odds must be finite and > 1, got {odds}")


def edge(model_prob: float, odds: float) -> float:
    """``edge = p × odds − 1``."""
    _check(model_prob, odds)
    return model_prob * odds - 1


def kelly_fraction(model_prob: float, odds: float) -> float:
    """Full Kelly ``f* = (p × odds − 1) / (odds − 1)``. Negative when there is no edge."""
    _check(model_prob, odds)
    return (model_prob * odds - 1) / (odds - 1)


def stake_fraction(
    model_prob: float, odds: float, config: DecisionConfig = DEFAULT_CONFIG
) -> float:
    """``min(k × max(f*, 0), cap)`` with ``k`` and ``cap`` from ``config``."""
    f_star = kelly_fraction(model_prob, odds)
    return min(config.kelly_multiplier * max(f_star, 0.0), config.per_bet_cap)
