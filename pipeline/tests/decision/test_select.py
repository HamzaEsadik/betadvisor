"""Filters and per-match selection (FR-D5, FR-D6, SRS 9.6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from betadvisor.decision import DecisionConfig, MatchInput, select_match, select_signals
from betadvisor.decision.filters import (
    Candidate,
    QualityFlag,
    odds_are_stale,
    pick_one_per_match,
)
from betadvisor.decision.select import SignalDecision

NOW = datetime(2026, 11, 9, 7, 0, tzinfo=UTC)


def match(
    odds: tuple[float, float, float],
    probs: tuple[float, float, float] | None,
    *,
    match_id: str = "PL_20261109_ARS_CHE",
    fetched: datetime = NOW - timedelta(hours=1),
    teams_known: bool = True,
    flags: frozenset[QualityFlag] = frozenset(),
) -> MatchInput:
    return MatchInput(
        match_id=match_id,
        odds=dict(zip(("HOME", "DRAW", "AWAY"), odds, strict=True)),  # type: ignore[arg-type]
        bookmaker="pinnacle",
        odds_fetched_at=fetched,
        model_probs=(
            dict(zip(("HOME", "DRAW", "AWAY"), probs, strict=True))  # type: ignore[arg-type]
            if probs
            else None
        ),
        teams_known=teams_known,
        quality_flags=flags,
    )


def assert_schema_invariants(d: SignalDecision) -> None:
    """The cross-field rules of signals.schema.json that the engine must uphold."""
    if d.recommended:
        assert d.skip_reason is None
        assert d.edge is not None and d.edge > 0
        assert d.stake_fraction > 0
    else:
        assert d.skip_reason is not None
        assert d.stake_fraction == 0
    assert 0 < d.implied_prob < 1
    assert list(d.quality_flags) == sorted(set(d.quality_flags))


class TestRecommendation:
    def test_srs_example_is_recommended(self) -> None:
        d = select_match(match((2.10, 3.40, 3.60), (0.52, 0.25, 0.23)), NOW)
        assert_schema_invariants(d)
        assert (d.selection, d.recommended, d.skip_reason) == ("HOME", True, None)
        assert d.odds == 2.10
        assert d.model_prob == 0.52
        assert d.edge == pytest.approx(0.092)
        assert d.stake_fraction == pytest.approx(0.0209091, abs=1e-7)
        assert d.implied_prob == pytest.approx(0.454343, abs=1e-6)
        assert d.bookmaker == "pinnacle"
        assert d.quality_flags == ()

    @pytest.mark.parametrize(
        ("p_home", "odds_home", "recommended", "reason"),
        [
            (0.52, 2.00, True, None),  # edge 0.04 exactly (float noise above)
            (0.40, 2.60, True, None),  # edge 0.04 exactly (float noise below)
            (0.40, 2.59, False, "below_threshold"),  # edge 0.036
            (0.40, 2.50, False, "no_edge"),  # edge 0
        ],
    )
    def test_min_edge_boundary(
        self, p_home: float, odds_home: float, recommended: bool, reason: str | None
    ) -> None:
        rest = (1 - p_home) / 2
        d = select_match(match((odds_home, 1.5, 1.5), (p_home, rest, rest)), NOW)
        assert_schema_invariants(d)
        assert d.selection == "HOME"
        assert (d.recommended, d.skip_reason) == (recommended, reason)

    @pytest.mark.parametrize(
        ("odds", "probs", "selection", "recommended"),
        [
            ((1.39, 4.5, 8.0), (0.80, 0.12, 0.08), "HOME", False),  # edge 0.112
            ((1.40, 4.5, 8.0), (0.80, 0.12, 0.08), "HOME", True),  # edge 0.12
            ((1.60, 4.0, 6.01), (0.55, 0.20, 0.25), "AWAY", False),  # edge 0.5025
            ((1.60, 4.0, 6.00), (0.55, 0.20, 0.25), "AWAY", True),  # edge 0.50
        ],
    )
    def test_odds_range(
        self,
        odds: tuple[float, float, float],
        probs: tuple[float, float, float],
        selection: str,
        recommended: bool,
    ) -> None:
        d = select_match(match(odds, probs), NOW)
        assert_schema_invariants(d)
        assert d.selection == selection
        assert d.recommended is recommended
        assert d.skip_reason == (None if recommended else "odds_out_of_range")

    def test_negative_edge_everywhere_is_no_edge(self) -> None:
        # The model agrees with the bookmaker, so the margin makes every edge negative.
        odds = (2.10, 3.40, 3.60)
        d = select_match(match(odds, (0.454345, 0.280623, 0.265032)), NOW)
        assert_schema_invariants(d)
        assert (d.recommended, d.skip_reason) == (False, "no_edge")
        assert d.edge is not None and d.edge < 0

    def test_two_positive_selections_only_larger_edge(self) -> None:
        # HOME edge 0.46 × 2.5 − 1 = 0.15; AWAY edge 0.32 × 3.5 − 1 = 0.12; both qualify.
        d = select_match(match((2.5, 3.4, 3.5), (0.46, 0.22, 0.32)), NOW)
        assert_schema_invariants(d)
        assert (d.selection, d.recommended) == ("HOME", True)
        assert d.edge == pytest.approx(0.15)

    def test_eligible_selection_beats_larger_ineligible_edge(self) -> None:
        # AWAY edge 0.40 at odds 7.0 is out of range; HOME edge 0.10 is eligible.
        d = select_match(match((2.2, 3.0, 7.0), (0.50, 0.30, 0.20)), NOW)
        assert (d.selection, d.recommended) == ("HOME", True)

    def test_skipped_match_shows_largest_edge_reason(self) -> None:
        # AWAY edge 0.125 at 7.5 (out of range) beats HOME edge 0.02 (below threshold).
        # DRAW edge 0.34 × 2.8 − 1 = −0.048.
        d = select_match(match((2.0, 2.8, 7.5), (0.51, 0.34, 0.15)), NOW)
        assert (d.selection, d.skip_reason) == ("AWAY", "odds_out_of_range")

    def test_stake_cap_applies(self) -> None:
        d = select_match(match((2.0, 4.0, 5.0), (0.70, 0.15, 0.15)), NOW)
        assert d.recommended
        assert d.stake_fraction == 0.05

    def test_shin_config_changes_implied_prob_only(self) -> None:
        m = match((2.10, 3.40, 3.60), (0.52, 0.25, 0.23))
        prop = select_match(m, NOW)
        sh = select_match(m, NOW, DecisionConfig(devig_method="shin"))
        assert sh.implied_prob != prop.implied_prob
        assert (sh.edge, sh.stake_fraction) == (prop.edge, prop.stake_fraction)


class TestDataQuality:
    def test_stale_odds_is_missing_data(self) -> None:
        d = select_match(
            match((2.10, 3.40, 3.60), (0.52, 0.25, 0.23), fetched=NOW - timedelta(hours=13)), NOW
        )
        assert_schema_invariants(d)
        assert (d.recommended, d.skip_reason) == (False, "missing_data")
        assert d.quality_flags == ("stale_odds",)

    def test_odds_exactly_twelve_hours_old_are_fresh(self) -> None:
        assert not odds_are_stale(NOW - timedelta(hours=12), NOW)
        assert odds_are_stale(NOW - timedelta(hours=12, seconds=1), NOW)

    def test_unknown_team_is_missing_data(self) -> None:
        d = select_match(match((2.10, 3.40, 3.60), (0.52, 0.25, 0.23), teams_known=False), NOW)
        assert_schema_invariants(d)
        assert d.skip_reason == "missing_data"
        assert d.quality_flags == ("low_data",)
        assert d.model_prob == 0.52  # still shown on the skipped row

    def test_no_model_probs_is_missing_data_on_favourite(self) -> None:
        d = select_match(match((2.10, 3.40, 3.60), None), NOW)
        assert_schema_invariants(d)
        assert (d.selection, d.skip_reason) == ("HOME", "missing_data")
        assert d.model_prob is None and d.edge is None
        assert "low_data" in d.quality_flags

    @pytest.mark.parametrize(
        ("p_home", "flags", "recommended", "reason"),
        [
            # odds 2.20, p 0.48 → edge 0.056: passes 4%, fails the 8% needed with low_data
            (0.48, frozenset({"low_data"}), False, "low_confidence"),
            (0.48, frozenset(), True, None),
            # p 1.08 / 2.20 → edge 0.08 exactly; p 0.50 → edge 0.10
            (1.08 / 2.20, frozenset({"low_data"}), True, None),
            (0.50, frozenset({"low_data"}), True, None),
        ],
    )
    def test_low_data_needs_double_edge(
        self,
        p_home: float,
        flags: frozenset[QualityFlag],
        recommended: bool,
        reason: str | None,
    ) -> None:
        rest = (1 - p_home) / 2
        d = select_match(match((2.20, 3.4, 3.6), (p_home, rest, rest), flags=flags), NOW)
        assert_schema_invariants(d)
        assert d.selection == "HOME"
        assert (d.recommended, d.skip_reason) == (recommended, reason)
        assert d.quality_flags == tuple(sorted(flags))

    def test_other_flags_pass_through_without_blocking(self) -> None:
        d = select_match(
            match(
                (2.10, 3.40, 3.60),
                (0.52, 0.25, 0.23),
                flags=frozenset({"single_bookmaker", "form_incomplete"}),
            ),
            NOW,
        )
        assert d.recommended
        assert d.quality_flags == ("form_incomplete", "single_bookmaker")


class TestInputValidation:
    def test_missing_outcome_odds_raise(self) -> None:
        m = MatchInput(
            match_id="X",
            odds={"HOME": 2.0, "AWAY": 3.0},
            bookmaker="b",
            odds_fetched_at=NOW,
            model_probs=None,
        )
        with pytest.raises(ValueError, match="HOME, DRAW and AWAY"):
            select_match(m, NOW)

    def test_missing_outcome_probs_raise(self) -> None:
        m = MatchInput(
            match_id="X",
            odds={"HOME": 2.0, "DRAW": 3.0, "AWAY": 4.0},
            bookmaker="b",
            odds_fetched_at=NOW,
            model_probs={"HOME": 0.5, "DRAW": 0.5},
        )
        with pytest.raises(ValueError, match="model probabilities need"):
            select_match(m, NOW)

    def test_probs_not_summing_to_one_raise(self) -> None:
        with pytest.raises(ValueError, match="sum to"):
            select_match(match((2.0, 3.0, 4.0), (0.5, 0.3, 0.3)), NOW)

    def test_prob_out_of_range_raises(self) -> None:
        with pytest.raises(ValueError, match="not in"):
            select_match(match((2.0, 3.0, 4.0), (1.0, 0.0, 0.0)), NOW)

    def test_naive_datetime_raises(self) -> None:
        with pytest.raises(ValueError, match="timezone-aware"):
            select_match(match((2.0, 3.0, 4.0), (0.5, 0.3, 0.2)), NOW.replace(tzinfo=None))

    def test_duplicate_match_ids_raise(self) -> None:
        m = match((2.0, 3.0, 4.0), (0.5, 0.3, 0.2))
        with pytest.raises(ValueError, match="duplicate"):
            select_signals([m, m], NOW)

    def test_empty_candidates_raise(self) -> None:
        with pytest.raises(ValueError):
            pick_one_per_match([])


class TestSelectSignals:
    def test_one_entry_per_match_in_order(self) -> None:
        matches = [
            match((2.10, 3.40, 3.60), (0.52, 0.25, 0.23), match_id="PL_20261109_ARS_CHE"),
            match((2.3, 3.2, 3.1), (0.42, 0.29, 0.29), match_id="FL1_20261109_OL_OM"),
            match((2.10, 3.40, 3.60), None, match_id="PL_20261109_BRE_FUL"),
        ]
        out = select_signals(matches, NOW)
        assert [d.match_id for d in out] == [m.match_id for m in matches]
        assert [d.skip_reason for d in out] == [None, "no_edge", "missing_data"]
        for d in out:
            assert_schema_invariants(d)

    def test_pick_ties_keep_first(self) -> None:
        c = [
            Candidate(index=0, edge=0.1, implied_prob=0.3, reason=None),
            Candidate(index=1, edge=0.1, implied_prob=0.4, reason=None),
        ]
        assert pick_one_per_match(c).index == 0
