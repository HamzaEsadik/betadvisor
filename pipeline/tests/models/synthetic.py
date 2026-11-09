"""Seasons simulated from known Dixon-Coles parameters (fixed seed)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from betadvisor.models.dixon_coles import score_matrix


def true_params(n_teams: int, seed: int) -> tuple[list[str], np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    teams = [f"T{i:02d}" for i in range(n_teams)]
    attack = rng.normal(0.0, 0.3, n_teams)
    attack -= attack.mean()
    defence = rng.normal(0.0, 0.25, n_teams)
    return teams, attack, defence


def double_round_robin(n_teams: int) -> list[list[tuple[int, int]]]:
    """Circle method: ``2 (n − 1)`` rounds, every team plays once per round."""
    ids = list(range(n_teams))
    first_half = []
    for _ in range(n_teams - 1):
        first_half.append([(ids[i], ids[n_teams - 1 - i]) for i in range(n_teams // 2)])
        ids = [ids[0], ids[-1], *ids[1:-1]]
    return first_half + [[(a, h) for h, a in rnd] for rnd in first_half]


def simulate_league(
    seasons: int,
    n_teams: int = 20,
    home: float = 0.3,
    rho: float = -0.1,
    base: float = 0.1,
    seed: int = 7,
    league: str = "PL",
    first_year: int = 2014,
) -> tuple[pd.DataFrame, list[str], np.ndarray, np.ndarray]:
    """Double round robin per season, one round per week from August.

    ``defence`` is shifted by ``base`` so the average goal rate is realistic; ``attack`` is
    centered, so the fit should recover ``attack``, ``defence + base`` and ``home``.
    """
    teams, attack, defence = true_params(n_teams, seed)
    defence = defence + base
    rng = np.random.default_rng(seed + 1)
    rows = []
    for s in range(seasons):
        year = first_year + s
        start = pd.Timestamp(year=year, month=8, day=10)
        for r, fixtures in enumerate(double_round_robin(n_teams)):
            date = start + pd.Timedelta(days=7 * r)
            for h, a in fixtures:
                lam = np.exp(home + attack[h] + defence[a])
                mu = np.exp(attack[a] + defence[h])
                m = score_matrix(lam, mu, rho)
                hg, ag = divmod(int(rng.choice(m.size, p=m.ravel())), m.shape[1])
                rows.append(
                    {
                        "season": f"{year}-{(year + 1) % 100:02d}",
                        "league": league,
                        "date": date,
                        "home_code": f"{league}{teams[h]}",
                        "away_code": f"{league}{teams[a]}",
                        "home_goals": hg,
                        "away_goals": ag,
                    }
                )
    frame = pd.DataFrame(rows).sort_values("date", kind="stable").reset_index(drop=True)
    return frame, [f"{league}{t}" for t in teams], attack, defence
