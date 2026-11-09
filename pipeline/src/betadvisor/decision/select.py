"""Turn (match, model probabilities, odds) into the decision fields of signal entries.

Each match yields exactly one entry: the recommended selection, or the most promising skipped
one with its reason. Identity, context and versioning fields are added by the feed writer.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from betadvisor.decision import devig
from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.decision.edge import edge as compute_edge
from betadvisor.decision.edge import stake_fraction as compute_stake_fraction
from betadvisor.decision.filters import (
    Candidate,
    QualityFlag,
    SkipReason,
    assess_match,
    pick_one_per_match,
    skip_reason,
)

Selection = Literal["HOME", "DRAW", "AWAY"]
SELECTIONS: tuple[Selection, ...] = ("HOME", "DRAW", "AWAY")

# Model probabilities for one match must sum to 1 within this tolerance.
PROB_SUM_TOLERANCE = 1e-6


@dataclass(frozen=True, slots=True)
class MatchInput:
    """Everything the decision engine needs about one 1X2 match."""

    match_id: str
    odds: Mapping[Selection, float]
    bookmaker: str
    odds_fetched_at: datetime
    model_probs: Mapping[Selection, float] | None
    teams_known: bool = True
    quality_flags: frozenset[QualityFlag] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class SignalDecision:
    """Decision fields of one signal entry (``signals.schema.json``).

    ``model_prob`` and ``edge`` are ``None`` only when the model gave no probabilities; such an
    entry is always skipped with ``missing_data`` and cannot be published as is.
    """

    match_id: str
    selection: Selection
    odds: float
    bookmaker: str
    odds_fetched_at: datetime
    model_prob: float | None
    implied_prob: float
    edge: float | None
    stake_fraction: float
    recommended: bool
    skip_reason: SkipReason | None
    quality_flags: tuple[QualityFlag, ...]


def _validate(match: MatchInput) -> None:
    if set(match.odds) != set(SELECTIONS):
        raise ValueError(
            f"{match.match_id}: 1X2 odds need HOME, DRAW and AWAY, got {set(match.odds)}"
        )
    if match.model_probs is None:
        return
    if set(match.model_probs) != set(SELECTIONS):
        raise ValueError(
            f"{match.match_id}: model probabilities need HOME, DRAW and AWAY, "
            f"got {set(match.model_probs)}"
        )
    for sel, p in match.model_probs.items():
        if not 0 < p < 1:
            raise ValueError(f"{match.match_id}: model_prob {sel}={p} is not in (0, 1)")
    total = math.fsum(match.model_probs.values())
    if abs(total - 1) > PROB_SUM_TOLERANCE:
        raise ValueError(f"{match.match_id}: model probabilities sum to {total}, not 1")


def select_match(
    match: MatchInput, now: datetime, config: DecisionConfig = DEFAULT_CONFIG
) -> SignalDecision:
    """The single signal entry for ``match`` at time ``now``."""
    _validate(match)
    odds = [match.odds[s] for s in SELECTIONS]
    implied = devig.implied_probabilities(odds, config.devig_method)
    quality = assess_match(
        has_model_probs=match.model_probs is not None,
        teams_known=match.teams_known,
        odds_fetched_at=match.odds_fetched_at,
        now=now,
        flags=match.quality_flags,
        config=config,
    )

    model = [match.model_probs[s] for s in SELECTIONS] if match.model_probs is not None else None
    edges = [compute_edge(p, o) for p, o in zip(model, odds, strict=True)] if model else None
    candidates = [
        Candidate(
            index=i,
            edge=edges[i] if edges else None,
            implied_prob=implied[i],
            reason=skip_reason(
                edge=edges[i] if edges else None, odds=odds[i], quality=quality, config=config
            ),
        )
        for i in range(len(SELECTIONS))
    ]
    best = pick_one_per_match(candidates)
    i = best.index
    recommended = best.reason is None
    stake = compute_stake_fraction(model[i], odds[i], config) if recommended and model else 0.0
    return SignalDecision(
        match_id=match.match_id,
        selection=SELECTIONS[i],
        odds=odds[i],
        bookmaker=match.bookmaker,
        odds_fetched_at=match.odds_fetched_at,
        model_prob=model[i] if model else None,
        implied_prob=implied[i],
        edge=best.edge,
        stake_fraction=stake,
        recommended=recommended,
        skip_reason=best.reason,
        quality_flags=tuple(sorted(quality.flags)),
    )


def select_signals(
    matches: Iterable[MatchInput], now: datetime, config: DecisionConfig = DEFAULT_CONFIG
) -> list[SignalDecision]:
    """One entry per match, in input order. Duplicate match ids fail loudly."""
    out: list[SignalDecision] = []
    seen: set[str] = set()
    for match in matches:
        if match.match_id in seen:
            raise ValueError(f"duplicate match_id {match.match_id}")
        seen.add(match.match_id)
        out.append(select_match(match, now, config))
    return out
