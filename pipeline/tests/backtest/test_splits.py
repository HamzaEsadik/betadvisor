"""Walk-forward splits never train on a date at or after the test window."""

from __future__ import annotations

import pandas as pd
import pytest

from betadvisor.backtest.run import parse_seasons
from betadvisor.backtest.splits import Window, monthly_windows, split, walk_forward
from tests.models.synthetic import simulate_league


def test_monthly_windows() -> None:
    dates = pd.Series(pd.to_datetime(["2024-08-30", "2024-08-01", "2024-10-03"]))
    windows = monthly_windows(dates)
    assert [w.start for w in windows] == [pd.Timestamp("2024-08-01"), pd.Timestamp("2024-10-01")]
    assert windows[0].end == pd.Timestamp("2024-09-01")
    assert monthly_windows(pd.Series([], dtype="datetime64[ns]")) == []


def test_walk_forward_trains_only_on_earlier_dates() -> None:
    matches, _, _, _ = simulate_league(seasons=3)
    mask = matches["season"] == "2016-17"
    covered = 0
    for window, train, test in walk_forward(matches, mask):
        assert not test.empty
        assert (train["date"] < window.start).all()
        assert (test["date"] >= window.start).all() and (test["date"] < window.end).all()
        assert train["date"].max() < test["date"].min()
        assert test["season"].eq("2016-17").all()
        covered += len(test)
    assert covered == int(mask.sum())


def test_split_and_window_validation() -> None:
    matches = pd.DataFrame({"date": pd.to_datetime(["2024-01-05", "2024-01-10"])})
    train, test = split(matches, Window(pd.Timestamp("2024-01-08"), pd.Timestamp("2024-02-01")))
    assert len(train) == 1 and len(test) == 1
    with pytest.raises(ValueError, match="not before"):
        Window(pd.Timestamp("2024-01-11"), pd.Timestamp("2024-01-11"))


def test_parse_seasons() -> None:
    assert parse_seasons("2022-23..2025-26") == ["2022-23", "2023-24", "2024-25", "2025-26"]
    assert parse_seasons("2024-25") == ["2024-25"]
    assert parse_seasons("1999-00") == ["1999-00"]
    for bad in ("2022-24", "2022", "2025-26..2022-23"):
        with pytest.raises(ValueError):
            parse_seasons(bad)
