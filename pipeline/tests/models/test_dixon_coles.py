"""Dixon-Coles: score matrix, low-score correction, gradient, and parameter recovery."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from scipy.optimize import check_grad
from scipy.stats import poisson

from betadvisor.models.dixon_coles import (
    DixonColesConfig,
    _neg_ll_and_grad,
    decay_weights,
    fit_dixon_coles,
    outcome_probs,
    score_matrix,
)
from tests.models.synthetic import double_round_robin, simulate_league

NO_DECAY = DixonColesConfig(xi=0.0, max_history_days=20 * 365)


def test_score_matrix_sums_to_one_and_matches_poisson_when_rho_is_zero() -> None:
    m = score_matrix(1.6, 1.1, 0.0)
    assert m.shape == (11, 11)
    assert m.sum() == pytest.approx(1.0, abs=1e-12)
    goals = np.arange(11)
    expected = np.outer(poisson.pmf(goals, 1.6), poisson.pmf(goals, 1.1))
    np.testing.assert_allclose(m, expected / expected.sum(), rtol=1e-12)


def test_low_score_correction() -> None:
    lam, mu, rho = 1.4, 1.2, -0.12
    base = score_matrix(lam, mu, 0.0)
    corrected = score_matrix(lam, mu, rho)
    # Before renormalising, only the four low scores change, by τ.
    ratio = corrected / base
    ratio /= ratio[2, 2]
    assert ratio[0, 0] == pytest.approx(1 - lam * mu * rho)
    assert ratio[0, 1] == pytest.approx(1 + lam * rho)
    assert ratio[1, 0] == pytest.approx(1 + mu * rho)
    assert ratio[1, 1] == pytest.approx(1 - rho)
    assert ratio[3, 2] == pytest.approx(1.0)


def test_outcome_probs_sum_to_one_and_follow_strength() -> None:
    h, d, a = outcome_probs(score_matrix(2.2, 0.7, -0.1))
    assert h + d + a == pytest.approx(1.0, abs=1e-12)
    assert h > d and h > a


def test_double_round_robin_shape() -> None:
    rounds = double_round_robin(6)
    assert len(rounds) == 10
    for rnd in rounds:
        teams = [t for pair in rnd for t in pair]
        assert sorted(teams) == list(range(6))
    pairs = [p for rnd in rounds for p in rnd]
    assert len(set(pairs)) == 30


def test_analytic_gradient_matches_numeric() -> None:
    rng = np.random.default_rng(3)
    n, k = 6, 80
    hi = rng.integers(0, n, k)
    ai = (hi + rng.integers(1, n, k)) % n
    x = rng.integers(0, 3, k)
    y = rng.integers(0, 3, k)
    w = rng.uniform(0.2, 1.0, k)
    theta = np.concatenate([rng.normal(0, 0.2, 2 * n), [0.25, -0.08]])

    def f(t: np.ndarray) -> float:
        return _neg_ll_and_grad(t, hi, ai, x, y, w, n, 0.05)[0]

    def g(t: np.ndarray) -> np.ndarray:
        return _neg_ll_and_grad(t, hi, ai, x, y, w, n, 0.05)[1]

    assert check_grad(f, g, theta) < 1e-4


def test_fit_recovers_known_parameters() -> None:
    matches, teams, attack, defence = simulate_league(seasons=5, home=0.3, rho=-0.1)
    params = fit_dixon_coles(matches, config=NO_DECAY)
    assert list(params.teams) == sorted(teams)
    order = [params.index(t) for t in teams]
    att_err = np.abs(params.attack[order] - attack)
    def_err = np.abs(params.defence[order] - defence)
    assert params.home == pytest.approx(0.3, abs=0.05)
    assert params.rho == pytest.approx(-0.1, abs=0.06)
    assert att_err.mean() < 0.08 and att_err.max() < 0.25
    assert def_err.mean() < 0.08 and def_err.max() < 0.25
    assert params.attack.sum() == pytest.approx(0.0, abs=1e-9)


def test_fit_probabilities_sum_to_one() -> None:
    matches, teams, _, _ = simulate_league(seasons=2)
    params = fit_dixon_coles(matches)
    for h, a in [(teams[0], teams[1]), (teams[5], teams[2])]:
        assert sum(params.probs_1x2(h, a)) == pytest.approx(1.0, abs=1e-12)


def test_fit_rejects_matches_on_or_after_reference_date() -> None:
    matches, _, _, _ = simulate_league(seasons=1)
    cutoff = matches["date"].iloc[len(matches) // 2]
    with pytest.raises(ValueError, match="on or after"):
        fit_dixon_coles(matches, reference_date=cutoff)
    fit_dixon_coles(matches[matches["date"] < cutoff], reference_date=cutoff)


def test_unknown_team_fails_loudly() -> None:
    matches, teams, _, _ = simulate_league(seasons=1)
    params = fit_dixon_coles(matches)
    assert not params.knows("NOPE")
    with pytest.raises(KeyError, match="NOPE"):
        params.probs_1x2(teams[0], "NOPE")


def test_decay_weights() -> None:
    ref = pd.Timestamp("2024-01-11")
    dates = pd.Series(pd.to_datetime(["2024-01-01", "2024-01-11"]))
    np.testing.assert_allclose(decay_weights(dates, ref, 0.1), [np.exp(-1.0), 1.0])
    with pytest.raises(ValueError, match="after the reference"):
        decay_weights(dates, pd.Timestamp("2024-01-05"), 0.1)


def test_history_window_and_config_validation() -> None:
    matches, _, _, _ = simulate_league(seasons=3)
    ref = matches["date"].max() + pd.Timedelta(days=1)
    short = fit_dixon_coles(matches, ref, DixonColesConfig(max_history_days=200))
    assert len(short.teams) == 20
    with pytest.raises(ValueError, match="no training matches"):
        fit_dixon_coles(matches, ref + pd.Timedelta(days=400), DixonColesConfig(max_history_days=1))
    with pytest.raises(ValueError, match="zero matches"):
        fit_dixon_coles(matches.iloc[0:0])
    for bad in ({"xi": -1.0}, {"max_history_days": 0}, {"ridge": -0.1}):
        with pytest.raises(ValueError):
            DixonColesConfig(**bad)  # type: ignore[arg-type]
