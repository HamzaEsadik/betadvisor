"""Walk-forward splits: train strictly on matches dated before the test window starts."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True, slots=True)
class Window:
    """Test matches have ``start <= date < end``; training matches have ``date < start``."""

    start: pd.Timestamp
    end: pd.Timestamp

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise ValueError(f"window start {self.start} is not before its end {self.end}")


def monthly_windows(dates: pd.Series) -> list[Window]:
    """One window per calendar month that contains at least one of ``dates``."""
    if dates.empty:
        return []
    months = sorted(set(dates.dt.to_period("M")))
    return [Window(start=m.start_time, end=(m + 1).start_time) for m in months]


def split(matches: pd.DataFrame, window: Window) -> tuple[pd.DataFrame, pd.DataFrame]:
    """``(train, test)`` for one window: every training date is before every test date."""
    train = matches[matches["date"] < window.start]
    test = matches[(matches["date"] >= window.start) & (matches["date"] < window.end)]
    return train, test


def walk_forward(
    matches: pd.DataFrame, test_mask: pd.Series
) -> Iterator[tuple[Window, pd.DataFrame, pd.DataFrame]]:
    """Monthly ``(window, train, test)`` triples covering the rows selected by ``test_mask``.

    ``train`` may include any earlier match (inside or outside ``test_mask``); ``test`` only
    contains selected rows.
    """
    for window in monthly_windows(matches.loc[test_mask, "date"]):
        train, test = split(matches, window)
        yield window, train, test[test_mask.loc[test.index]]
