"""Goal-difference-weighted Elo with home advantage and season-start regression.

Matches are processed strictly in date order. The ratings attached to a match are the ones
*before* it is played, so a match's own result (or any later one) never leaks into its features.

Update for one match, with ``dr = R_home + home_advantage - R_away``:

    expected_home = 1 / (1 + 10 ** (-dr / 400))
    delta         = k * G(|goal difference|) * (score_home - expected_home)
    R_home += delta;  R_away -= delta                         (zero-sum)

``G`` is the World Football Elo multiplier: 1 for a margin of 0 or 1, 1.5 for 2, and
``(11 + margin) / 8`` above. The first time a team plays in a new season its rating is pulled
toward ``initial`` by ``season_regression``. A team that first appears after its league's first
season in the data is a promoted side and starts at ``initial + promoted_offset``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from betadvisor.features._order import chronological


@dataclass(frozen=True, slots=True)
class EloConfig:
    initial: float = 1500.0
    k: float = 20.0
    home_advantage: float = 60.0
    season_regression: float = 0.25
    promoted_offset: float = -100.0

    def __post_init__(self) -> None:
        if self.k <= 0:
            raise ValueError(f"k must be > 0, got {self.k}")
        if not 0 <= self.season_regression <= 1:
            raise ValueError(f"season_regression must be in [0, 1], got {self.season_regression}")

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


DEFAULT_ELO = EloConfig()


def expected_home(home_rating: float, away_rating: float, home_advantage: float) -> float:
    """Expected score of the home side (win = 1, draw = 0.5)."""
    return float(1.0 / (1.0 + 10.0 ** (-(home_rating + home_advantage - away_rating) / 400.0)))


def margin_multiplier(goal_difference: int) -> float:
    margin = abs(goal_difference)
    if margin <= 1:
        return 1.0
    if margin == 2:
        return 1.5
    return (11.0 + margin) / 8.0


def elo_ratings(
    matches: pd.DataFrame, config: EloConfig = DEFAULT_ELO
) -> tuple[pd.DataFrame, dict[str, float]]:
    """Pre-match ratings for every match, plus every team's rating after the last match.

    ``matches`` needs ``season``, ``league``, ``date``, ``home_code``, ``away_code``,
    ``home_goals`` and ``away_goals``. The returned frame shares its index and has columns
    ``home_elo``, ``away_elo`` (before the match) and ``elo_delta`` (the home side's change).
    """
    ordered = chronological(matches)
    home_elo = np.empty(len(ordered))
    away_elo = np.empty(len(ordered))
    delta_out = np.empty(len(ordered))

    ratings: dict[str, float] = {}
    team_season: dict[str, str] = {}
    league_first_season: dict[str, str] = {}

    rows = zip(
        ordered["season"],
        ordered["league"],
        ordered["home_code"],
        ordered["away_code"],
        ordered["home_goals"],
        ordered["away_goals"],
        strict=True,
    )
    for i, (season, league, home, away, hg, ag) in enumerate(rows):
        first_season = league_first_season.setdefault(league, season)
        for team in (home, away):
            if team not in ratings:
                promoted = season != first_season
                ratings[team] = config.initial + (config.promoted_offset if promoted else 0.0)
            elif team_season[team] != season:
                ratings[team] = config.initial + (1 - config.season_regression) * (
                    ratings[team] - config.initial
                )
            team_season[team] = season

        rh, ra = ratings[home], ratings[away]
        score = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        delta = (
            config.k
            * margin_multiplier(int(hg) - int(ag))
            * (score - expected_home(rh, ra, config.home_advantage))
        )
        ratings[home] = rh + delta
        ratings[away] = ra - delta
        home_elo[i], away_elo[i], delta_out[i] = rh, ra, delta

    out = pd.DataFrame(
        {"home_elo": home_elo, "away_elo": away_elo, "elo_delta": delta_out},
        index=ordered.index,
    )
    return out.reindex(matches.index), ratings
