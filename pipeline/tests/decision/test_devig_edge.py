"""Margin removal, edge and stake fraction against hand-computed values (SRS 6.1 to 6.3)."""

from __future__ import annotations

import math

import pytest

from betadvisor.decision import (
    DecisionConfig,
    edge,
    implied_probabilities,
    kelly_fraction,
    stake_fraction,
)
from betadvisor.decision.devig import overround, proportional, shin

BOOKS = [
    (2.10, 3.40, 3.60),
    (1.25, 6.50, 12.0),
    (2.90, 3.10, 2.60),
    (1.05, 15.0, 41.0),
    (2.00, 2.00),
    (3.0, 3.0, 3.0),  # exactly fair
    (3.2, 3.3, 3.4),  # overround < 1
]


class TestDevig:
    def test_proportional_hand_computed(self) -> None:
        # raw = 1/2.10, 1/3.40, 1/3.60 = 0.476190, 0.294118, 0.277778; overround 1.048085
        probs = proportional([2.10, 3.40, 3.60])
        assert overround([2.10, 3.40, 3.60]) == pytest.approx(1.048085, abs=1e-6)
        assert probs == pytest.approx([0.454343, 0.280624, 0.265033], abs=1e-6)

    @pytest.mark.parametrize("method", ["proportional", "shin"])
    @pytest.mark.parametrize("odds", BOOKS)
    def test_sums_to_one(self, odds: tuple[float, ...], method: str) -> None:
        probs = implied_probabilities(odds, method)  # type: ignore[arg-type]
        assert math.fsum(probs) == pytest.approx(1.0, abs=1e-9)
        assert all(0 < p < 1 for p in probs)

    def test_shin_shifts_margin_to_long_shot(self) -> None:
        odds = [1.25, 6.50, 12.0]
        prop, sh = proportional(odds), shin(odds)
        assert sh[0] > prop[0]
        assert sh[2] < prop[2]

    def test_shin_without_margin_is_proportional(self) -> None:
        assert shin([3.2, 3.3, 3.4]) == pytest.approx(proportional([3.2, 3.3, 3.4]), abs=1e-12)

    def test_shin_on_fair_book_keeps_probabilities(self) -> None:
        assert shin([2.0, 4.0, 4.0]) == pytest.approx([0.5, 0.25, 0.25], abs=1e-12)

    @pytest.mark.parametrize(
        "odds", [[2.0], [1.0, 2.0], [0.5, 3.0], [math.inf, 2.0], [math.nan, 2]]
    )
    def test_bad_odds_raise(self, odds: list[float]) -> None:
        with pytest.raises(ValueError):
            proportional(odds)
        with pytest.raises(ValueError):
            shin(odds)

    def test_unknown_method_raises(self) -> None:
        with pytest.raises(ValueError, match="unknown devig method"):
            implied_probabilities([2.0, 2.0], "power")  # type: ignore[arg-type]


class TestEdgeAndStake:
    def test_srs_example(self) -> None:
        # p 0.52, odds 2.10: edge 0.092, f* 0.092 / 1.10 = 0.083636, × 0.25 = 0.020909
        assert edge(0.52, 2.10) == pytest.approx(0.092, abs=1e-12)
        assert kelly_fraction(0.52, 2.10) == pytest.approx(0.0836364, abs=1e-7)
        assert stake_fraction(0.52, 2.10) == pytest.approx(0.0209091, abs=1e-7)

    def test_negative_edge_stakes_nothing(self) -> None:
        assert edge(0.40, 2.30) == pytest.approx(-0.08)
        assert kelly_fraction(0.40, 2.30) < 0
        assert stake_fraction(0.40, 2.30) == 0.0

    def test_per_bet_cap(self) -> None:
        # f* = (0.7 × 2 − 1) / 1 = 0.4, × 0.25 = 0.10, capped at 0.05
        assert stake_fraction(0.70, 2.00) == 0.05
        assert stake_fraction(0.70, 2.00, DecisionConfig(per_bet_cap=0.2)) == pytest.approx(0.10)

    def test_kelly_multiplier(self) -> None:
        cfg = DecisionConfig(kelly_multiplier=0.5)
        assert stake_fraction(0.52, 2.10, cfg) == pytest.approx(0.0418182, abs=1e-7)

    @pytest.mark.parametrize(("p", "odds"), [(0.0, 2.0), (1.0, 2.0), (0.5, 1.0), (0.5, math.nan)])
    def test_bad_inputs_raise(self, p: float, odds: float) -> None:
        with pytest.raises(ValueError):
            edge(p, odds)
        with pytest.raises(ValueError):
            stake_fraction(p, odds)


class TestConfig:
    def test_defaults_and_dict(self) -> None:
        d = DecisionConfig().to_dict()
        assert d == {
            "min_edge": 0.04,
            "min_odds": 1.40,
            "max_odds": 6.00,
            "kelly_multiplier": 0.25,
            "per_bet_cap": 0.05,
            "max_odds_age_hours": 12.0,
            "low_confidence_edge_multiple": 2.0,
            "devig_method": "proportional",
        }

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"min_edge": 0},
            {"min_odds": 1.0},
            {"min_odds": 7.0},
            {"kelly_multiplier": 0},
            {"per_bet_cap": 1.5},
            {"max_odds_age_hours": 0},
            {"low_confidence_edge_multiple": 0.5},
            {"devig_method": "power"},
        ],
    )
    def test_invalid_config_raises(self, kwargs: dict[str, object]) -> None:
        with pytest.raises(ValueError):
            DecisionConfig(**kwargs)  # type: ignore[arg-type]
