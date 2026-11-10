"""Shot rates: hand-computed updates, missing statistics, and no look-ahead leakage."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from betadvisor.features.shots import (
    SHOT_RATE_COLUMNS,
    ShotRate,
    current_shot_rates,
    shot_rates,
)
from tests.models.synthetic import simulate_league


def frame(rows: list[tuple[str, str, str, float, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.to_datetime([r[0] for r in rows]),
            "league": "PL",
            "home_code": [r[1] for r in rows],
            "away_code": [r[2] for r in rows],
            "home_shots_target": [r[3] for r in rows],
            "away_shots_target": [r[4] for r in rows],
        }
    )


def test_hand_computed_rates() -> None:
    m = frame(
        [
            ("2024-08-10", "AAA", "BBB", 6, 2),
            ("2024-08-17", "BBB", "AAA", 4, 4),
            ("2024-08-24", "AAA", "CCC", 1, 1),
        ]
    )
    r = shot_rates(m, decay=0.5)
    assert r.iloc[0].isna().all()  # nobody has played yet
    # Match 2: BBB made 2 and faced 6 in match 1; AAA made 6 and faced 2.
    assert r.iloc[1].tolist() == [2.0, 6.0, 6.0, 2.0]
    # Match 3: AAA = 0.5 * (6, 2) + 0.5 * (4, 4) = (5, 3); CCC has never played.
    assert r.iloc[2, :2].tolist() == [5.0, 3.0]
    assert math.isnan(r.iloc[2, 2]) and math.isnan(r.iloc[2, 3])
    final = current_shot_rates(m, decay=0.5)
    assert final["AAA"] == ShotRate(3.0, 2.0)  # 0.5 * (5, 3) + 0.5 * (1, 1)
    assert final["CCC"] == ShotRate(1.0, 1.0)


def test_match_without_statistics_leaves_rates_unchanged() -> None:
    m = frame(
        [
            ("2024-08-10", "AAA", "BBB", 6, 2),
            ("2024-08-17", "AAA", "BBB", float("nan"), float("nan")),
            ("2024-08-24", "AAA", "BBB", 1, 1),
        ]
    )
    r = shot_rates(m, decay=0.5)
    assert r.iloc[2].tolist() == r.iloc[1].tolist() == [6.0, 2.0, 2.0, 6.0]
    assert "CCC" not in current_shot_rates(m)


def test_output_follows_input_index_when_shuffled() -> None:
    matches, _, _, _ = simulate_league(seasons=1, n_teams=6)
    shuffled = matches.sample(frac=1.0, random_state=1)
    pd.testing.assert_frame_equal(shot_rates(shuffled).loc[matches.index], shot_rates(matches))
    assert list(shot_rates(shuffled).columns) == SHOT_RATE_COLUMNS


def test_no_lookahead_leakage() -> None:
    """A match's own shots, and every later match, never change its features."""
    matches, _, _, _ = simulate_league(seasons=2, n_teams=8)
    base = shot_rates(matches)
    k = len(matches) // 2
    changed = matches.copy()
    changed.loc[changed.index[k:], ["home_shots_target", "away_shots_target"]] = 99.0
    after = shot_rates(changed)
    # Same date as match k counts as "not before": compare strictly earlier dates only.
    cutoff = matches["date"].iloc[k]
    same = matches["date"] <= cutoff
    pd.testing.assert_frame_equal(after[same], base[same])
    assert not np.allclose(after[~same].to_numpy(), base[~same].to_numpy(), equal_nan=True)


def test_missing_columns_and_bad_decay_fail_loudly() -> None:
    m = frame([("2024-08-10", "AAA", "BBB", 1, 1)])
    with pytest.raises(ValueError, match="no shot statistics"):
        shot_rates(m.drop(columns=["away_shots_target"]))
    with pytest.raises(ValueError, match="decay"):
        shot_rates(m, decay=1.0)
