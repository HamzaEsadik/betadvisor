"""Bankroll simulation: hand-computed stake and payout, daily cap, minimum stake."""

from __future__ import annotations

import math

import pandas as pd
import pytest

from betadvisor.backtest.bankroll import (
    BankrollConfig,
    flat_stake,
    max_drawdown,
    simulate,
    summarize,
)

PROBS = ["p_h", "p_d", "p_a"]
ODDS = ["o_h", "o_d", "o_a"]
CLOSE = ["c_h", "c_d", "c_a"]


def match(
    day: str,
    home: str,
    probs: tuple[float, float, float],
    odds: tuple[float, ...],
    outcome: int,
    close: tuple[float, ...] = (math.nan,) * 3,
) -> dict[str, object]:
    return {
        "date": pd.Timestamp(day),
        "league": "PL",
        "home_code": home,
        "away_code": home + "X",
        "outcome": outcome,
        **dict(zip(PROBS, probs, strict=True)),
        **dict(zip(ODDS, odds, strict=True)),
        **dict(zip(CLOSE, close, strict=True)),
    }


def test_srs_example_stake_and_win() -> None:
    # p 0.52 at 2.10: f* = 0.092 / 1.10, quarter Kelly = 0.020909 → floor(209.09) cents.
    frame = pd.DataFrame(
        [match("2024-09-01", "ARS", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 0, (2.0, 3.5, 4.0))]
    )
    result = simulate(frame, PROBS, ODDS, CLOSE)
    bet = result.bets.iloc[0]
    assert bet["selection"] == "HOME"
    assert bet["stake_cents"] == 209
    assert bet["payout_cents"] == 439  # round(209 × 2.10 = 438.9)
    assert bet["profit_cents"] == 230
    assert result.curve["bankroll_cents"].tolist() == [10_230]
    summary = summarize(result, BankrollConfig(), seed=1)
    assert summary["roi"] == pytest.approx(230 / 209)
    assert summary["mean_clv"] == pytest.approx(2.10 / 2.0 - 1)
    assert summary["hit_rate"] == 1.0


def test_loss_and_stakes_use_start_of_day_bankroll() -> None:
    frame = pd.DataFrame(
        [
            match("2024-09-01", "ARS", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 2),
            match("2024-09-01", "CHE", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 2),
            match("2024-09-02", "LIV", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 1),
        ]
    )
    result = simulate(frame, PROBS, ODDS)
    assert result.bets["stake_cents"].tolist() == [209, 209, 200]  # floor(0.020909 × 9582 = 200.35)
    assert result.curve["bankroll_cents"].tolist() == [9_582, 9_382]


def test_daily_cap_takes_bets_in_edge_order() -> None:
    # p 0.70: every stake hits the 5% per-bet cap (500); a 15% day allows three.
    rows = [
        match("2024-09-01", team, (0.70, 0.15, 0.15), (odds, 3.0, 3.0), 0)
        for team, odds in (("AAA", 2.9), ("BBB", 3.0), ("CCC", 3.1), ("DDD", 3.2))
    ]
    result = simulate(pd.DataFrame(rows), PROBS, ODDS)
    assert result.bets["stake_cents"].tolist() == [500, 500, 500]
    assert [m.split("_")[2] for m in result.bets["match_id"]] == [
        "DDD-DDDX",
        "CCC-CCCX",
        "BBB-BBBX",
    ]
    assert result.skipped_cap == 1


def test_min_stake_and_missing_odds_are_skipped() -> None:
    frame = pd.DataFrame(
        [
            match("2024-09-01", "ARS", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 0),
            match("2024-09-01", "CHE", (0.52, 0.26, 0.22), (math.nan, 3.40, 3.80), 0),
        ]
    )
    result = simulate(frame, PROBS, ODDS, config=BankrollConfig(start_cents=1_000))
    assert result.bets.empty  # 0.020909 × 1000 = 20 cents < $1
    assert result.skipped_min_stake == 1
    assert result.matches_without_odds == 1
    summary = summarize(result, BankrollConfig(start_cents=1_000), seed=1)
    assert summary["roi"] is None and summary["final_cents"] == 1_000


def test_no_bet_when_no_edge() -> None:
    frame = pd.DataFrame([match("2024-09-01", "ARS", (0.40, 0.30, 0.30), (2.10, 3.0, 3.0), 0)])
    assert simulate(frame, PROBS, ODDS).bets.empty


def test_max_drawdown() -> None:
    assert max_drawdown(pd.Series([12_000, 9_000, 15_000, 12_000]), 10_000) == pytest.approx(0.25)
    assert max_drawdown(pd.Series([11_000]), 10_000) == 0.0


def test_flat_stake() -> None:
    frame = pd.DataFrame(
        [
            match("2024-09-01", "ARS", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 0),
            match("2024-09-01", "CHE", (0.52, 0.26, 0.22), (2.10, 3.40, 3.80), 2),
            match("2024-09-02", "LIV", (0.40, 0.30, 0.30), (2.10, 3.0, 3.0), 0),
            match("2024-09-02", "MCI", (0.52, 0.26, 0.22), (math.nan, 3.40, 3.80), 0),
        ]
    ).assign(season="2024-25")
    out = flat_stake(frame, PROBS, ODDS, seed=1)
    assert out["bets"] == 2
    assert out["roi"] == pytest.approx((1.10 - 1.0) / 2)
    assert out["by_season"] == {"2024-25": {"bets": 2, "roi": pytest.approx(0.05)}}
    assert flat_stake(frame.iloc[2:], PROBS, ODDS)["bets"] == 0
