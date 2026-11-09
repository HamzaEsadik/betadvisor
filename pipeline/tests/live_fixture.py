"""Shared setup for the offline live-run tests: the clock, the history and the recordings.

The history is simulated (fixed seeds) with real PL and BL1 team codes, so the recorded API
responses in ``tests/recordings/live`` resolve through ``teams.csv``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from tests.models.synthetic import simulate_league

RECORDINGS = Path(__file__).parent / "recordings" / "live"
NOW = datetime(2026, 11, 9, 6, 0, tzinfo=UTC)

PL_CODES = [
    "ARS", "AVL", "BHA", "BOU", "BRE", "BUR", "CHE", "CRY", "EVE", "FUL",
    "LEE", "LIV", "MCI", "MUN", "NEW", "NFO", "SUN", "TOT", "WHU", "WOL",
]  # fmt: skip
BL1_CODES = [
    "B04", "BAY", "BMG", "BVB", "FCA", "FCU", "HDH", "HSV", "KOE",
    "M05", "RBL", "SCF", "SGE", "STP", "SVW", "TSG", "VFB", "WOB",
]  # fmt: skip


def _league(league: str, codes: list[str], seed: int) -> pd.DataFrame:
    frame, synthetic, _, _ = simulate_league(
        seasons=3, n_teams=len(codes), seed=seed, league=league, first_year=2023
    )
    rename = dict(zip(synthetic, codes, strict=True))
    frame["home_code"] = frame["home_code"].map(rename)
    frame["away_code"] = frame["away_code"].map(rename)
    return frame


def live_history() -> pd.DataFrame:
    """Three simulated seasons (2023-24 to 2025-26) of PL and BL1."""
    frame = pd.concat([_league("PL", PL_CODES, 11), _league("BL1", BL1_CODES, 12)])
    return frame.sort_values(["date", "league", "home_code"], kind="stable").reset_index(drop=True)


def write_history(path: Path) -> Path:
    live_history().to_csv(path, index=False, date_format="%Y-%m-%d")
    return path
