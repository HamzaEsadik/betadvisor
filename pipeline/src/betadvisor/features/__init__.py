"""Pre-match features computed in strict date order (SRS 3.1, 6.7)."""

from __future__ import annotations

import pandas as pd

from betadvisor.features.elo import DEFAULT_ELO, EloConfig, elo_ratings
from betadvisor.features.form import form
from betadvisor.features.rest import rest_days


def build_features(matches: pd.DataFrame, elo_config: EloConfig = DEFAULT_ELO) -> pd.DataFrame:
    """``matches`` plus Elo, form and rest-day columns, each known before kickoff."""
    elo, _ = elo_ratings(matches, elo_config)
    return pd.concat([matches, elo, form(matches), rest_days(matches)], axis=1)


__all__ = ["DEFAULT_ELO", "EloConfig", "build_features", "elo_ratings", "form", "rest_days"]
