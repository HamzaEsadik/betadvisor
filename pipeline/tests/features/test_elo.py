"""Elo: hand-computed update, zero-sum, regression, promotion, and no look-ahead leakage."""

from __future__ import annotations

import pandas as pd
import pytest

from betadvisor.features import build_features
from betadvisor.features.elo import EloConfig, elo_ratings, expected_home, margin_multiplier

NO_DRIFT = EloConfig(season_regression=0.0, promoted_offset=0.0)


def matches(*rows: tuple[str, str, str, str, int, int], league: str = "PL") -> pd.DataFrame:
    """Rows of (season, date, home, away, home goals, away goals)."""
    return pd.DataFrame(
        {
            "season": [r[0] for r in rows],
            "league": league,
            "date": pd.to_datetime([r[1] for r in rows]),
            "home_code": [r[2] for r in rows],
            "away_code": [r[3] for r in rows],
            "home_goals": [r[4] for r in rows],
            "away_goals": [r[5] for r in rows],
        }
    )


def test_margin_multiplier() -> None:
    assert [margin_multiplier(gd) for gd in (0, 1, -1, 2, -2, 3, 5)] == [
        1.0,
        1.0,
        1.0,
        1.5,
        1.5,
        14 / 8,
        16 / 8,
    ]


def test_first_match_hand_computed() -> None:
    elo, final = elo_ratings(matches(("2014-15", "2014-08-16", "ARS", "CHE", 2, 0)))
    # E = 1 / (1 + 10^(-60/400)) = 0.585499...; delta = 20 * 1.5 * (1 - E) = 12.4350...
    assert expected_home(1500, 1500, 60) == pytest.approx(0.5854990)
    assert elo.iloc[0].tolist() == pytest.approx([1500.0, 1500.0, 12.4350], abs=1e-4)
    assert final == pytest.approx({"ARS": 1512.4350, "CHE": 1487.5650}, abs=1e-4)


def test_zero_sum_per_match(fixture_history: pd.DataFrame) -> None:
    elo, final = elo_ratings(fixture_history, NO_DRIFT)
    # Without regression or promotion offsets, every team starts at 1500 and points only move.
    assert sum(final.values()) == pytest.approx(1500.0 * len(final))
    # The rating a team brings to its next match equals its pre-match rating +/- delta.
    feats = pd.concat([fixture_history, elo], axis=1)
    seen: dict[str, float] = {}
    for row in feats.itertuples():
        for team, pre in ((row.home_code, row.home_elo), (row.away_code, row.away_elo)):
            if team in seen:
                assert pre == pytest.approx(seen[team])
        seen[row.home_code] = row.home_elo + row.elo_delta
        seen[row.away_code] = row.away_elo - row.elo_delta
    assert seen == pytest.approx(final)


def test_season_regression_and_promoted_start() -> None:
    cfg = EloConfig(k=100, season_regression=0.25, promoted_offset=-100)
    data = matches(
        ("2014-15", "2014-08-16", "ARS", "CHE", 5, 0),
        ("2015-16", "2015-08-08", "ARS", "WAT", 1, 1),
    )
    elo, _ = elo_ratings(data, cfg)
    after_first = 1500 + 100 * (11 + 5) / 8 * (1 - expected_home(1500, 1500, 60))
    assert elo.loc[1, "home_elo"] == pytest.approx(1500 + 0.75 * (after_first - 1500))
    assert elo.loc[1, "away_elo"] == 1400.0  # WAT first appears after the league's first season


def test_teams_in_first_season_start_at_initial() -> None:
    elo, _ = elo_ratings(matches(("2014-15", "2014-08-16", "HUL", "STK", 0, 0)))
    assert elo.iloc[0][["home_elo", "away_elo"]].tolist() == [1500.0, 1500.0]


def test_output_follows_input_index_not_date_order(fixture_history: pd.DataFrame) -> None:
    shuffled = fixture_history.sample(frac=1.0, random_state=7)
    expected, _ = elo_ratings(fixture_history)
    got, _ = elo_ratings(shuffled)
    pd.testing.assert_frame_equal(got.sort_index(), expected)


def test_no_lookahead_leakage(fixture_history: pd.DataFrame) -> None:
    full = build_features(fixture_history)
    for cutoff in sorted(fixture_history["date"].unique())[:-1]:
        past = fixture_history[fixture_history["date"] <= cutoff]
        truncated = build_features(past)
        pd.testing.assert_frame_equal(truncated, full.loc[past.index])


def test_changing_a_result_only_affects_later_matches(fixture_history: pd.DataFrame) -> None:
    changed = fixture_history.copy()
    i = 10
    changed.loc[i, "home_goals"] += 3
    before = build_features(fixture_history)
    after = build_features(changed)
    earlier = fixture_history["date"] <= fixture_history.loc[i, "date"]
    feature_cols = ["home_elo", "away_elo", "home_form", "away_form"]
    pd.testing.assert_frame_equal(
        before.loc[earlier, feature_cols], after.loc[earlier, feature_cols]
    )
    assert not before.loc[~earlier, "home_elo"].equals(after.loc[~earlier, "home_elo"])


def test_team_playing_twice_on_one_date_is_rejected() -> None:
    data = matches(
        ("2014-15", "2014-08-16", "ARS", "CHE", 1, 0),
        ("2014-15", "2014-08-16", "HUL", "ARS", 1, 0),
    )
    with pytest.raises(ValueError, match="ARS plays twice on 2014-08-16"):
        elo_ratings(data)


@pytest.mark.parametrize("kwargs", [{"k": 0.0}, {"season_regression": 1.5}])
def test_config_validation(kwargs: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        EloConfig(**kwargs)


def test_config_to_dict() -> None:
    assert EloConfig().to_dict()["home_advantage"] == 60.0
