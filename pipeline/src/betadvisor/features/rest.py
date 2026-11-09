"""Rest days: calendar days since the team's previous match in the data.

Only league matches are in the history, so cup and European games are not counted; rest can be
overstated for teams in those competitions. ``NaN`` before a team's first match.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from betadvisor.features._order import chronological


def rest_days(matches: pd.DataFrame) -> pd.DataFrame:
    """Columns ``home_rest_days`` and ``away_rest_days`` (float), sharing the input index."""
    ordered = chronological(matches)
    last_played: dict[str, pd.Timestamp] = {}
    home_rest = np.full(len(ordered), np.nan)
    away_rest = np.full(len(ordered), np.nan)
    rows = zip(ordered["date"], ordered["home_code"], ordered["away_code"], strict=True)
    for i, (day, home, away) in enumerate(rows):
        if home in last_played:
            home_rest[i] = (day - last_played[home]).days
        if away in last_played:
            away_rest[i] = (day - last_played[away]).days
        last_played[home] = last_played[away] = day
    out = pd.DataFrame(
        {"home_rest_days": home_rest, "away_rest_days": away_rest}, index=ordered.index
    )
    return out.reindex(matches.index)
