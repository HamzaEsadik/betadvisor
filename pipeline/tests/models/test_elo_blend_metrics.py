"""Elo ordered logit, the blend, and the scoring rules."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from betadvisor.models import BLEND_VERSION, MODEL_VERSION
from betadvisor.models.blend import blend, choose_weight
from betadvisor.models.elo_1x2 import OrderedLogit, fit_ordered_logit, outcome_index
from betadvisor.models.metrics import brier, calibration_bins, log_loss


def test_model_version() -> None:
    assert MODEL_VERSION == "dc-elo-sot-0.2.0"  # Part 18: the shot stacker ships
    assert BLEND_VERSION == "dc-elo-0.1.0"


def test_outcome_index() -> None:
    idx = outcome_index(pd.Series([2, 1, 0]), pd.Series([0, 1, 3]))
    assert idx.tolist() == [0, 1, 2]


def test_ordered_logit_probs_sum_to_one_and_are_monotone() -> None:
    model = OrderedLogit(beta=0.6, c1=-0.9, c2=0.3)
    diffs = np.linspace(-400, 400, 9)
    p = model.probs(diffs)
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-12)
    assert (np.diff(p[:, 0]) > 0).all()  # home win rises with the Elo gap
    assert (np.diff(p[:, 2]) < 0).all()
    assert (p > 0).all()


def test_ordered_logit_recovers_parameters() -> None:
    true = OrderedLogit(beta=0.55, c1=-0.85, c2=0.25)
    rng = np.random.default_rng(11)
    diffs = rng.normal(0, 150, 20_000)
    p = true.probs(diffs)
    u = rng.uniform(size=len(diffs))[:, None]
    outcome = (u > p.cumsum(axis=1)).sum(axis=1).astype(np.int64)
    fit = fit_ordered_logit(diffs, outcome)
    assert fit.beta == pytest.approx(0.55, abs=0.03)
    assert fit.c1 == pytest.approx(-0.85, abs=0.03)
    assert fit.c2 == pytest.approx(0.25, abs=0.03)


def test_ordered_logit_needs_all_outcomes() -> None:
    with pytest.raises(ValueError, match="home win, draw and away"):
        fit_ordered_logit(np.array([1.0, 2.0]), np.array([0, 0]))
    with pytest.raises(ValueError, match="lengths"):
        fit_ordered_logit(np.array([1.0]), np.array([0, 1]))


def test_log_loss_and_brier_hand_computed() -> None:
    probs = np.array([[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]])
    outcome = np.array([0, 1])
    assert log_loss(probs, outcome) == pytest.approx(-(math.log(0.5) + math.log(0.3)) / 2)
    # (0.25 + 0.09 + 0.04) and (0.04 + 0.49 + 0.25)
    assert brier(probs, outcome) == pytest.approx((0.38 + 0.78) / 2)
    with pytest.raises(ValueError):
        log_loss(probs[:, :2], outcome)
    with pytest.raises(ValueError):
        brier(probs, np.array([0]))
    with pytest.raises(ValueError):
        brier(probs[:0], outcome[:0])


def test_calibration_bins() -> None:
    probs = np.array([[0.65, 0.25, 0.10], [0.62, 0.28, 0.10]])
    bins = calibration_bins(probs, np.array([0, 2]), n_bins=10)
    assert sum(b.count for b in bins) == 6
    six = bins[6]
    assert six.count == 2 and six.observed == pytest.approx(0.5)
    assert six.mean_predicted == pytest.approx(0.635)
    assert bins[1].count == 2 and bins[1].observed == pytest.approx(0.5)  # the two 0.10s
    assert bins[9].count == 0 and bins[9].observed is None


def test_blend_and_weight_choice() -> None:
    dc = np.array([[0.6, 0.25, 0.15], [0.2, 0.3, 0.5]])
    elo = np.array([[0.4, 0.3, 0.3], [0.4, 0.3, 0.3]])
    np.testing.assert_allclose(blend(dc, elo, 0.25), 0.25 * dc + 0.75 * elo)
    # Dixon-Coles is right on both, so the full weight wins.
    assert choose_weight(dc, elo, np.array([0, 2])) == 1.0
    assert choose_weight(dc, elo, np.array([2, 0])) == 0.0
    with pytest.raises(ValueError):
        blend(dc, elo, 1.5)
    with pytest.raises(ValueError):
        blend(dc, elo[:1], 0.5)
    with pytest.raises(ValueError):
        choose_weight(dc[:0], elo[:0], np.array([], dtype=np.int64))
