"""Recommendation filters (FR-D5) and the one-selection-per-match rule (SRS 9.6).

A skipped selection gets exactly one ``skip_reason``, checked in this order:

1. ``missing_data``: no model probability, a team the pipeline cannot identify, or odds older
   than ``max_odds_age_hours`` (also flagged ``stale_odds``).
2. ``no_edge``: edge <= 0.
3. ``below_threshold``: 0 < edge < ``min_edge``.
4. ``odds_out_of_range``: odds outside [``min_odds``, ``max_odds``].
5. ``low_confidence``: flagged ``low_data`` and edge below
   ``low_confidence_edge_multiple × min_edge``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig

SkipReason = Literal[
    "no_edge", "below_threshold", "odds_out_of_range", "missing_data", "low_confidence"
]
QualityFlag = Literal["low_data", "stale_odds", "form_incomplete", "single_bookmaker"]

# Threshold comparisons tolerate float noise, so an edge of exactly 4% passes a 4% minimum.
EPS = 1e-9


def _require_aware(name: str, value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware, got naive {value.isoformat()}")


def odds_are_stale(
    odds_fetched_at: datetime, now: datetime, config: DecisionConfig = DEFAULT_CONFIG
) -> bool:
    """True when the odds are older than ``config.max_odds_age_hours`` at ``now``."""
    _require_aware("odds_fetched_at", odds_fetched_at)
    _require_aware("now", now)
    return now - odds_fetched_at > timedelta(hours=config.max_odds_age_hours)


@dataclass(frozen=True, slots=True)
class MatchQuality:
    """Match-level data checks, shared by the three selections of a match."""

    flags: frozenset[QualityFlag]
    missing_data: bool


def assess_match(
    *,
    has_model_probs: bool,
    teams_known: bool,
    odds_fetched_at: datetime,
    now: datetime,
    flags: frozenset[QualityFlag] = frozenset(),
    config: DecisionConfig = DEFAULT_CONFIG,
) -> MatchQuality:
    """Add the flags these checks imply and say whether required data is missing."""
    out = set(flags)
    missing = False
    if not has_model_probs or not teams_known:
        out.add("low_data")
        missing = True
    if odds_are_stale(odds_fetched_at, now, config):
        out.add("stale_odds")
        missing = True
    return MatchQuality(flags=frozenset(out), missing_data=missing)


def skip_reason(
    *,
    edge: float | None,
    odds: float,
    quality: MatchQuality,
    config: DecisionConfig = DEFAULT_CONFIG,
) -> SkipReason | None:
    """Why this selection cannot be recommended, or ``None`` if it passes every filter."""
    if quality.missing_data or edge is None:
        return "missing_data"
    if edge <= EPS:
        return "no_edge"
    if edge < config.min_edge - EPS:
        return "below_threshold"
    if not config.min_odds - EPS <= odds <= config.max_odds + EPS:
        return "odds_out_of_range"
    low_conf_edge = config.low_confidence_edge_multiple * config.min_edge
    if "low_data" in quality.flags and edge < low_conf_edge - EPS:
        return "low_confidence"
    return None


@dataclass(frozen=True, slots=True)
class Candidate:
    """One selection of a match after filtering, before the per-match pick."""

    index: int
    edge: float | None
    implied_prob: float
    reason: SkipReason | None


def pick_one_per_match(candidates: Sequence[Candidate]) -> Candidate:
    """The single selection a match publishes (SRS 9.6).

    The eligible selection with the largest edge wins. With none eligible, the selection with
    the largest edge represents the match with its own skip reason; with no edges at all
    (no model probabilities), the bookmaker favourite does. Ties keep the earliest index.
    """
    if not candidates:
        raise ValueError("a match needs at least one candidate selection")
    eligible = [c for c in candidates if c.reason is None]
    pool = eligible or list(candidates)
    with_edge = [c for c in pool if c.edge is not None]
    if with_edge:
        return max(with_edge, key=lambda c: (c.edge, -c.index))
    return max(pool, key=lambda c: (c.implied_prob, -c.index))
