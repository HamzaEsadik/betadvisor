"""Recent form: the team's last results before a match, as a "WWDWL" string.

Oldest result first, newest on the right (as shown in design 12). Shorter than ``length`` when
the team has played fewer matches in the data; empty before its first match.
"""

from __future__ import annotations

from collections import deque

import pandas as pd

from betadvisor.features._order import chronological

FORM_LENGTH = 5


def result_letter(goals_for: int, goals_against: int) -> str:
    return "W" if goals_for > goals_against else "D" if goals_for == goals_against else "L"


def form(matches: pd.DataFrame, length: int = FORM_LENGTH) -> pd.DataFrame:
    """Columns ``home_form`` and ``away_form`` (before the match), sharing the input index."""
    if length < 1:
        raise ValueError(f"length must be >= 1, got {length}")
    ordered = chronological(matches)
    history: dict[str, deque[str]] = {}
    home_form: list[str] = []
    away_form: list[str] = []
    rows = zip(
        ordered["home_code"],
        ordered["away_code"],
        ordered["home_goals"],
        ordered["away_goals"],
        strict=True,
    )
    for home, away, hg, ag in rows:
        h = history.setdefault(home, deque(maxlen=length))
        a = history.setdefault(away, deque(maxlen=length))
        home_form.append("".join(h))
        away_form.append("".join(a))
        h.append(result_letter(hg, ag))
        a.append(result_letter(ag, hg))
    out = pd.DataFrame({"home_form": home_form, "away_form": away_form}, index=ordered.index)
    return out.reindex(matches.index)
