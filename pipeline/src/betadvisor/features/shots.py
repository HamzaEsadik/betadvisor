"""Shots on target for and against: an exponentially weighted average per team (Part 18).

Matches are processed strictly in date order, and the rates attached to a match are the ones
*before* it, so a match's own shots (or any later ones) never leak into its features. After a
match with statistics, each side's rate moves toward what it did in that match:

    rate = decay * rate + (1 - decay) * observed          (first observation: rate = observed)

A match without statistics (blank in the source CSV, or a recent result merged from the fixture
API) leaves the rates unchanged. A team has no rate (``NaN``) until its first match with
statistics; callers must treat that as missing data, not as zero shots.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np
import pandas as pd

from betadvisor.features._order import chronological

SHOT_DECAY = 0.9
SHOT_STAT_COLUMNS = ["home_shots_target", "away_shots_target"]
SHOT_RATE_COLUMNS = [
    "home_sot_for",
    "home_sot_against",
    "away_sot_for",
    "away_sot_against",
]


@dataclass(frozen=True, slots=True)
class ShotRate:
    sot_for: float
    sot_against: float


def _check(matches: pd.DataFrame, decay: float) -> None:
    if not 0 < decay < 1:
        raise ValueError(f"decay must be in (0, 1), got {decay}")
    missing = [c for c in SHOT_STAT_COLUMNS if c not in matches.columns]
    if missing:
        raise ValueError(f"history has no shot statistics: missing columns {missing}")


def _walk(
    ordered: pd.DataFrame, decay: float, state: dict[str, ShotRate]
) -> Iterator[tuple[ShotRate | None, ShotRate | None]]:
    """Yields each match's pre-match (home, away) rates and updates ``state`` after it."""
    rows = zip(
        ordered["home_code"],
        ordered["away_code"],
        ordered["home_shots_target"],
        ordered["away_shots_target"],
        strict=True,
    )
    for home, away, hst, ast in rows:
        yield state.get(home), state.get(away)
        if math.isnan(hst) or math.isnan(ast):
            continue
        for team, made, faced in ((home, hst, ast), (away, ast, hst)):
            old = state.get(team)
            state[team] = (
                ShotRate(float(made), float(faced))
                if old is None
                else ShotRate(
                    decay * old.sot_for + (1 - decay) * made,
                    decay * old.sot_against + (1 - decay) * faced,
                )
            )


def shot_rates(matches: pd.DataFrame, decay: float = SHOT_DECAY) -> pd.DataFrame:
    """``SHOT_RATE_COLUMNS`` (float, NaN where unknown), sharing the input index."""
    _check(matches, decay)
    ordered = chronological(matches)
    values = np.full((len(ordered), 4), np.nan)
    for i, (home, away) in enumerate(_walk(ordered, decay, {})):
        if home is not None:
            values[i, 0:2] = home.sot_for, home.sot_against
        if away is not None:
            values[i, 2:4] = away.sot_for, away.sot_against
    out = pd.DataFrame(values, columns=SHOT_RATE_COLUMNS, index=ordered.index)
    return out.reindex(matches.index)


def current_shot_rates(matches: pd.DataFrame, decay: float = SHOT_DECAY) -> dict[str, ShotRate]:
    """Each team's rate after all of ``matches`` (for predicting the next fixture)."""
    _check(matches, decay)
    state: dict[str, ShotRate] = {}
    for _ in _walk(chronological(matches), decay, state):
        pass
    return state
