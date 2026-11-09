"""Dixon-Coles (1997) bivariate Poisson model with low-score correction and time decay.

For a match between home side ``i`` and away side ``j``:

    log λ = home + attack_i + defence_j        (home goals ~ Poisson(λ))
    log μ = attack_j + defence_i               (away goals ~ Poisson(μ))

``defence`` is a *leakiness*: higher means the side concedes more. The probability of a
scoreline ``(x, y)`` is ``Poisson(x; λ) Poisson(y; μ) τ(x, y)``, where ``τ`` corrects the four
low scores with one parameter ``ρ``:

    τ(0, 0) = 1 − λμρ     τ(0, 1) = 1 + λρ     τ(1, 0) = 1 + μρ     τ(1, 1) = 1 − ρ

Each match is weighted by ``exp(−ξ × days before the reference date)``. Parameters are fitted
by weighted maximum likelihood (L-BFGS-B with an analytic gradient). Attack strengths are
identified by the constraint ``Σ attack = 0``, enforced with a quadratic penalty.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]

# Score matrix covers 0..MAX_GOALS goals per side and is renormalised to sum to 1.
MAX_GOALS = 10
RHO_BOUNDS = (-0.3, 0.3)
# Weight of the ``(Σ attack)²`` identification penalty in the negative log-likelihood.
_CENTER_PENALTY = 10.0
_TAU_FLOOR = 1e-10


@dataclass(frozen=True, slots=True)
class DixonColesConfig:
    xi: float = 0.0019  # per day; a weight halves after about a year
    max_history_days: int = 3 * 365
    ridge: float = 0.0  # optional L2 shrinkage of attack/defence towards 0

    def __post_init__(self) -> None:
        if self.xi < 0:
            raise ValueError(f"xi must be >= 0, got {self.xi}")
        if self.max_history_days <= 0:
            raise ValueError(f"max_history_days must be > 0, got {self.max_history_days}")
        if self.ridge < 0:
            raise ValueError(f"ridge must be >= 0, got {self.ridge}")

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


DEFAULT_DC = DixonColesConfig()


@dataclass(frozen=True, slots=True)
class DixonColesParams:
    teams: tuple[str, ...]
    attack: FloatArray
    defence: FloatArray
    home: float
    rho: float

    def index(self, team: str) -> int:
        try:
            return self.teams.index(team)
        except ValueError:
            raise KeyError(f"team {team!r} has no Dixon-Coles parameters") from None

    def knows(self, team: str) -> bool:
        return team in self.teams

    def rates(self, home_team: str, away_team: str) -> tuple[float, float]:
        """Expected goals ``(λ, μ)`` for the home and away sides."""
        h, a = self.index(home_team), self.index(away_team)
        lam = np.exp(self.home + self.attack[h] + self.defence[a])
        mu = np.exp(self.attack[a] + self.defence[h])
        return float(lam), float(mu)

    def score_matrix(self, home_team: str, away_team: str) -> FloatArray:
        lam, mu = self.rates(home_team, away_team)
        return score_matrix(lam, mu, self.rho)

    def probs_1x2(self, home_team: str, away_team: str) -> tuple[float, float, float]:
        return outcome_probs(self.score_matrix(home_team, away_team))


def tau(x: IntArray, y: IntArray, lam: FloatArray, mu: FloatArray, rho: float) -> FloatArray:
    """Dixon-Coles low-score correction factor for each match."""
    out = np.ones_like(lam)
    out = np.where((x == 0) & (y == 0), 1 - lam * mu * rho, out)
    out = np.where((x == 0) & (y == 1), 1 + lam * rho, out)
    out = np.where((x == 1) & (y == 0), 1 + mu * rho, out)
    out = np.where((x == 1) & (y == 1), 1 - rho, out)
    return out


def score_matrix(lam: float, mu: float, rho: float, max_goals: int = MAX_GOALS) -> FloatArray:
    """``P[x, y]`` for 0..max_goals goals each, renormalised to sum to 1."""
    goals = np.arange(max_goals + 1)
    m = np.outer(poisson.pmf(goals, lam), poisson.pmf(goals, mu))
    m[0, 0] *= 1 - lam * mu * rho
    m[0, 1] *= 1 + lam * rho
    m[1, 0] *= 1 + mu * rho
    m[1, 1] *= 1 - rho
    m = np.clip(m, 0.0, None)
    return np.asarray(m / m.sum(), dtype=np.float64)


def outcome_probs(matrix: FloatArray) -> tuple[float, float, float]:
    """``(P(home), P(draw), P(away))`` from a score matrix (rows: home goals)."""
    home = float(np.tril(matrix, -1).sum())
    draw = float(np.trace(matrix))
    away = float(np.triu(matrix, 1).sum())
    total = home + draw + away
    return home / total, draw / total, away / total


def decay_weights(dates: pd.Series, reference: pd.Timestamp, xi: float) -> FloatArray:
    days = (reference - dates).dt.days.to_numpy(dtype=np.float64)
    if (days < 0).any():
        raise ValueError(f"match dates after the reference date {reference:%Y-%m-%d}")
    return np.asarray(np.exp(-xi * days), dtype=np.float64)


def _neg_ll_and_grad(
    theta: FloatArray,
    hi: IntArray,
    ai: IntArray,
    x: IntArray,
    y: IntArray,
    w: FloatArray,
    n_teams: int,
    ridge: float,
) -> tuple[float, FloatArray]:
    attack = theta[:n_teams]
    defence = theta[n_teams : 2 * n_teams]
    home, rho = theta[-2], theta[-1]

    lam = np.exp(home + attack[hi] + defence[ai])
    mu = np.exp(attack[ai] + defence[hi])
    t = np.maximum(tau(x, y, lam, mu, rho), _TAU_FLOOR)

    ll = w * (np.log(t) + x * np.log(lam) - lam + y * np.log(mu) - mu)
    total = float(ll.sum())

    # d log τ / d log λ, d log μ, d ρ
    is00 = (x == 0) & (y == 0)
    is01 = (x == 0) & (y == 1)
    is10 = (x == 1) & (y == 0)
    is11 = (x == 1) & (y == 1)
    dt_lam = np.where(is00, -lam * mu * rho / t, 0.0) + np.where(is01, lam * rho / t, 0.0)
    dt_mu = np.where(is00, -lam * mu * rho / t, 0.0) + np.where(is10, mu * rho / t, 0.0)
    dt_rho = (
        np.where(is00, -lam * mu / t, 0.0)
        + np.where(is01, lam / t, 0.0)
        + np.where(is10, mu / t, 0.0)
        + np.where(is11, -1.0 / t, 0.0)
    )
    g_lam = w * (x - lam + dt_lam)
    g_mu = w * (y - mu + dt_mu)

    g_attack = np.bincount(hi, g_lam, n_teams) + np.bincount(ai, g_mu, n_teams)
    g_defence = np.bincount(ai, g_lam, n_teams) + np.bincount(hi, g_mu, n_teams)
    g_home = g_lam.sum()
    g_rho = (w * dt_rho).sum()

    s = attack.sum()
    penalty = _CENTER_PENALTY * s * s + ridge * (attack @ attack + defence @ defence)
    grad = -np.concatenate([g_attack, g_defence, [g_home, g_rho]])
    grad[:n_teams] += 2 * _CENTER_PENALTY * s + 2 * ridge * attack
    grad[n_teams : 2 * n_teams] += 2 * ridge * defence
    return -total + penalty, grad


def fit_dixon_coles(
    matches: pd.DataFrame,
    reference_date: pd.Timestamp | None = None,
    config: DixonColesConfig = DEFAULT_DC,
) -> DixonColesParams:
    """Fit on ``matches`` (``date``, ``home_code``, ``away_code``, ``home_goals``,
    ``away_goals``) played strictly before ``reference_date`` and within
    ``config.max_history_days`` of it. ``reference_date`` defaults to the day after the last
    match. Later matches are rejected rather than ignored, so a caller cannot leak them."""
    if matches.empty:
        raise ValueError("cannot fit Dixon-Coles on zero matches")
    if reference_date is None:
        reference_date = matches["date"].max() + pd.Timedelta(days=1)
    if (matches["date"] >= reference_date).any():
        raise ValueError(f"training matches on or after {reference_date:%Y-%m-%d}")
    window = matches[matches["date"] >= reference_date - pd.Timedelta(days=config.max_history_days)]
    if window.empty:
        raise ValueError("no training matches inside max_history_days")

    teams = tuple(sorted(set(window["home_code"]) | set(window["away_code"])))
    pos = {t: i for i, t in enumerate(teams)}
    hi = window["home_code"].map(pos).to_numpy(dtype=np.int64)
    ai = window["away_code"].map(pos).to_numpy(dtype=np.int64)
    x = window["home_goals"].to_numpy(dtype=np.int64)
    y = window["away_goals"].to_numpy(dtype=np.int64)
    w = decay_weights(window["date"], reference_date, config.xi)

    n = len(teams)
    theta0 = np.concatenate([np.zeros(2 * n), [0.25, 0.0]])
    bounds: Sequence[tuple[float | None, float | None]] = [(None, None)] * (2 * n) + [
        (None, None),
        RHO_BOUNDS,
    ]
    result = minimize(
        _neg_ll_and_grad,
        theta0,
        args=(hi, ai, x, y, w, n, config.ridge),
        jac=True,
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 2000},
    )
    if not result.success:
        raise RuntimeError(f"Dixon-Coles fit did not converge: {result.message}")
    theta = np.asarray(result.x, dtype=np.float64)
    attack = theta[:n] - theta[:n].mean()
    defence = theta[n : 2 * n] + theta[:n].mean()  # keeps attack_i + defence_j unchanged
    return DixonColesParams(
        teams=teams,
        attack=attack,
        defence=defence,
        home=float(theta[-2]),
        rho=float(theta[-1]),
    )
