"""Shared chronological ordering for every feature builder."""

from __future__ import annotations

import pandas as pd

ORDER_COLUMNS = ["date", "league", "home_code"]


def chronological(matches: pd.DataFrame) -> pd.DataFrame:
    """Matches sorted by date (stable), checked for a team playing twice on one date."""
    ordered = matches.sort_values(ORDER_COLUMNS, kind="stable")
    teams = pd.concat(
        [
            ordered[["date", "home_code"]].set_axis(["date", "team"], axis=1),
            ordered[["date", "away_code"]].set_axis(["date", "team"], axis=1),
        ]
    )
    clash = teams.duplicated()
    if clash.any():
        first = teams[clash].iloc[0]
        raise ValueError(f"team {first['team']} plays twice on {first['date']:%Y-%m-%d}")
    return ordered
