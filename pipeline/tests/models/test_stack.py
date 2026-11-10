"""Second-stage models: feature layout, fitting, calibration slice and loud failures."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from betadvisor.models.metrics import log_loss
from betadvisor.models.stack import (
    BoostedConfig,
    features,
    fit_boosted,
    fit_stacker,
)


def synthetic(n: int, seed: int = 3) -> tuple[np.ndarray, np.ndarray, np.ndarray, pd.Series]:
    """A noisy blend plus shot rates that carry extra signal about the outcome."""
    rng = np.random.default_rng(seed)
    strength = rng.normal(0, 1, n)  # true home-minus-away strength
    shots = np.column_stack(
        [
            4 + strength + rng.normal(0, 0.5, n),
            4 - strength + rng.normal(0, 0.5, n),
            4 - strength + rng.normal(0, 0.5, n),
            4 + strength + rng.normal(0, 0.5, n),
        ]
    )
    z = np.column_stack([0.9 * strength, np.zeros(n), -0.9 * strength])
    true = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    outcome = np.array([rng.choice(3, p=p) for p in true], dtype=np.int64)
    noisy = 0.4 * strength + rng.normal(0, 0.8, n)  # the blend only half-knows the strength
    zb = np.column_stack([noisy, np.zeros(n), -noisy])
    blend = np.exp(zb) / np.exp(zb).sum(axis=1, keepdims=True)
    dates = pd.Series(pd.date_range("2020-01-01", periods=n, freq="6h"))
    return blend, shots, outcome, dates


def test_features_layout() -> None:
    x = features(np.array([[0.5, 0.25, 0.25]]), np.array([[1.0, 2.0, 3.0, 4.0]]))
    np.testing.assert_allclose(x, [[np.log(2.0), np.log(1 / 3), 1, 2, 3, 4]])
    with pytest.raises(ValueError, match="expected"):
        features(np.ones((2, 3)) / 3, np.ones((3, 4)))


def test_stacker_learns_the_shot_signal() -> None:
    blend, shots, outcome, _ = synthetic(4000)
    x = features(blend, shots)
    model = fit_stacker(x[:3000], outcome[:3000])
    p = model.probs(x[3000:])
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-12)
    assert log_loss(p, outcome[3000:]) < log_loss(blend[3000:], outcome[3000:]) - 0.01


def test_boosted_is_calibrated_on_the_newest_rows() -> None:
    blend, shots, outcome, dates = synthetic(4000)
    x = features(blend, shots)
    model = fit_boosted(x[:3000], outcome[:3000], dates[:3000])
    p = model.probs(x[3000:])
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-9)
    assert log_loss(p, outcome[3000:]) < log_loss(blend[3000:], outcome[3000:])
    # Shuffling the row order changes nothing: the slices are chosen by date.
    perm = np.random.default_rng(0).permutation(3000)
    shuffled = fit_boosted(x[perm], outcome[perm], dates[:3000].iloc[perm].reset_index(drop=True))
    np.testing.assert_allclose(shuffled.probs(x[3000:]), p, atol=1e-9)


def test_loud_failures() -> None:
    blend, shots, outcome, dates = synthetic(1200)
    x = features(blend, shots)
    with pytest.raises(ValueError, match="need 1000"):
        fit_stacker(x[:500], outcome[:500])
    holed = x.copy()
    holed[0, 2] = np.nan
    with pytest.raises(ValueError, match="missing features"):
        fit_stacker(holed, outcome)
    model = fit_stacker(x, outcome)
    with pytest.raises(ValueError, match="missing features"):
        model.probs(holed[:1])
    with pytest.raises(ValueError, match="draws"):
        fit_stacker(x, np.where(outcome == 1, 0, outcome))
    with pytest.raises(ValueError, match="calibration_share"):
        BoostedConfig(calibration_share=1.0)
    with pytest.raises(ValueError, match="need 1000"):
        fit_boosted(x[:500], outcome[:500], dates[:500])
