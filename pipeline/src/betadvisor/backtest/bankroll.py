"""Paper bankroll simulation driven by the real decision engine.

Per match day (in date order):

1. Each match goes through ``decision.select_match`` with the model probabilities and the
   chosen odds (pre-match market average, or market-average closing odds).
2. Recommended stakes are ``floor(stake_fraction × bankroll at start of day)`` in cents.
3. App rules (FR-A5, FR-A6): bets are taken in descending edge order until the next one would
   push the day's stakes above ``daily_cap × start-of-day bankroll``; the rest are skipped.
   Stakes below ``min_stake_cents`` are skipped.
4. Every bet of the day is settled at the final score before the next day starts.

All money is integer cents.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from betadvisor.decision.config import DEFAULT_CONFIG, DecisionConfig
from betadvisor.decision.select import SELECTIONS, MatchInput, SignalDecision, select_match

OUTCOME_OF = {"HOME": 0, "DRAW": 1, "AWAY": 2}


@dataclass(frozen=True, slots=True)
class BankrollConfig:
    start_cents: int = 10_000
    daily_cap: float = 0.15
    min_stake_cents: int = 100
    decision: DecisionConfig = DEFAULT_CONFIG


DEFAULT_BANKROLL = BankrollConfig()


@dataclass(frozen=True, slots=True)
class BankrollResult:
    bets: pd.DataFrame  # one row per placed bet
    curve: pd.DataFrame  # date, bankroll_cents (after the day settles)
    skipped_cap: int
    skipped_min_stake: int
    matches_without_odds: int


@dataclass(slots=True)
class _Bet:
    date: pd.Timestamp
    league: str
    match_id: str
    selection: str
    odds: float
    model_prob: float | None
    edge: float
    stake_cents: int
    won: bool
    closing_odds: float | None
    payout_cents: int = 0
    profit_cents: int = 0


def _odds_ok(row: pd.Series, cols: list[str]) -> bool:
    return all(
        pd.notna(row[c]) and math.isfinite(float(row[c])) and float(row[c]) > 1 for c in cols
    )


def _decide(
    row: pd.Series,
    match_id: str,
    now: datetime,
    prob_cols: list[str],
    odds_cols: list[str],
    config: DecisionConfig,
) -> SignalDecision:
    probs = np.asarray([row[c] for c in prob_cols], dtype=np.float64)
    probs = probs / probs.sum()
    return select_match(
        MatchInput(
            match_id=match_id,
            odds=dict(zip(SELECTIONS, (float(row[c]) for c in odds_cols), strict=True)),
            bookmaker="market_avg",
            odds_fetched_at=now,
            model_probs=dict(zip(SELECTIONS, probs.tolist(), strict=True)),
        ),
        now=now,
        config=config,
    )


def flat_stake(
    preds: pd.DataFrame,
    prob_cols: list[str],
    odds_cols: list[str],
    config: DecisionConfig = DEFAULT_CONFIG,
    seed: int = 0,
    n_boot: int = 2000,
) -> dict[str, object]:
    """Every recommended signal at 1 unit, no bankroll, caps or minimum stake.

    Judges the signals themselves over the whole period, independent of bankroll path.
    """
    returns: list[float] = []
    by_season: dict[str, list[float]] = {}
    for _, row in preds.iterrows():
        if not _odds_ok(row, odds_cols):
            continue
        day = pd.Timestamp(row["date"])
        now = datetime(day.year, day.month, day.day, 9, tzinfo=UTC)
        decision = _decide(row, "flat", now, prob_cols, odds_cols, config)
        if not decision.recommended:
            continue
        won = int(row["outcome"]) == OUTCOME_OF[decision.selection]
        r = decision.odds - 1 if won else -1.0
        returns.append(r)
        by_season.setdefault(str(row["season"]), []).append(r)
    if not returns:
        return {"bets": 0, "roi": None, "roi_ci95": None, "by_season": {}}
    values = np.asarray(returns)
    boot = np.random.default_rng(seed).choice(values, size=(n_boot, len(values))).mean(axis=1)
    return {
        "bets": len(values),
        "roi": float(values.mean()),
        "roi_ci95": [float(np.quantile(boot, 0.025)), float(np.quantile(boot, 0.975))],
        "by_season": {
            season: {"bets": len(v), "roi": float(np.mean(v))}
            for season, v in sorted(by_season.items())
        },
    }


def simulate(
    preds: pd.DataFrame,
    prob_cols: list[str],
    odds_cols: list[str],
    close_cols: list[str] | None = None,
    config: BankrollConfig = DEFAULT_BANKROLL,
) -> BankrollResult:
    """Simulate the bankroll over ``preds`` (needs ``date``, ``league``, ``home_code``,
    ``away_code``, ``outcome`` plus the probability and odds columns, in H/D/A order).
    ``close_cols`` (if given) are used for closing-line value only."""
    bankroll = config.start_cents
    bets: list[_Bet] = []
    curve: list[dict[str, object]] = []
    skipped_cap = skipped_min = no_odds = 0

    for key, rows in preds.sort_values("date", kind="stable").groupby("date", sort=True):
        day = pd.Timestamp(key)  # type: ignore[arg-type]
        start = bankroll
        now = datetime(day.year, day.month, day.day, 9, tzinfo=UTC)
        day_bets: list[_Bet] = []
        for _, row in rows.iterrows():
            if not _odds_ok(row, odds_cols):
                no_odds += 1
                continue
            match_id = f"{day:%Y-%m-%d}_{row['league']}_{row['home_code']}-{row['away_code']}"
            decision = _decide(row, match_id, now, prob_cols, odds_cols, config.decision)
            if not decision.recommended or decision.edge is None:
                continue
            stake = math.floor(decision.stake_fraction * start)
            if stake < config.min_stake_cents:
                skipped_min += 1
                continue
            sel_i = OUTCOME_OF[decision.selection]
            closing = (
                float(row[close_cols[sel_i]])
                if close_cols and _odds_ok(row, [close_cols[sel_i]])
                else None
            )
            day_bets.append(
                _Bet(
                    date=day,
                    league=str(row["league"]),
                    match_id=match_id,
                    selection=decision.selection,
                    odds=decision.odds,
                    model_prob=decision.model_prob,
                    edge=decision.edge,
                    stake_cents=stake,
                    won=int(row["outcome"]) == sel_i,
                    closing_odds=closing,
                )
            )

        cap = math.floor(config.daily_cap * start)
        staked = 0
        day_bets.sort(key=lambda b: -b.edge)
        for n, bet in enumerate(day_bets):
            if staked + bet.stake_cents > cap:
                skipped_cap += len(day_bets) - n
                break
            staked += bet.stake_cents
            bet.payout_cents = round(bet.stake_cents * bet.odds) if bet.won else 0
            bet.profit_cents = bet.payout_cents - bet.stake_cents
            bets.append(bet)
            bankroll += bet.profit_cents
        curve.append({"date": day, "bankroll_cents": bankroll})

    bet_frame = pd.DataFrame([asdict(b) for b in bets], columns=list(_Bet.__dataclass_fields__))
    return BankrollResult(
        bets=bet_frame,
        curve=pd.DataFrame(curve, columns=["date", "bankroll_cents"]),
        skipped_cap=skipped_cap,
        skipped_min_stake=skipped_min,
        matches_without_odds=no_odds,
    )


def max_drawdown(curve_cents: pd.Series, start_cents: int) -> float:
    """Largest peak-to-trough fall as a fraction of the peak (SRS 6.6)."""
    values = np.concatenate([[start_cents], curve_cents.to_numpy(dtype=np.float64)])
    peaks = np.maximum.accumulate(values)
    return float(((peaks - values) / peaks).max())


def summarize(
    result: BankrollResult, config: BankrollConfig, seed: int, n_boot: int = 2000
) -> dict[str, object]:
    """Headline numbers plus a bootstrap 95% interval for ROI (bets resampled, fixed seed)."""
    bets = result.bets
    final = (
        int(result.curve["bankroll_cents"].iloc[-1]) if len(result.curve) else config.start_cents
    )
    out: dict[str, object] = {
        "start_cents": config.start_cents,
        "final_cents": final,
        "bets": len(bets),
        "skipped_daily_cap": result.skipped_cap,
        "skipped_min_stake": result.skipped_min_stake,
        "matches_without_odds": result.matches_without_odds,
    }
    if bets.empty:
        return out | {
            "staked_cents": 0,
            "profit_cents": 0,
            "roi": None,
            "hit_rate": None,
            "max_drawdown": 0.0,
            "roi_ci95": None,
            "mean_clv": None,
        }
    stake = bets["stake_cents"].to_numpy(dtype=np.float64)
    profit = bets["profit_cents"].to_numpy(dtype=np.float64)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(bets), size=(n_boot, len(bets)))
    boot = profit[idx].sum(axis=1) / stake[idx].sum(axis=1)
    clv = bets["closing_odds"].dropna()
    clv_values = bets.loc[clv.index, "odds"] / clv - 1
    return out | {
        "staked_cents": int(stake.sum()),
        "profit_cents": int(profit.sum()),
        "roi": float(profit.sum() / stake.sum()),
        "hit_rate": float(bets["won"].mean()),
        "max_drawdown": max_drawdown(result.curve["bankroll_cents"], config.start_cents),
        "roi_ci95": [float(np.quantile(boot, 0.025)), float(np.quantile(boot, 0.975))],
        "mean_clv": float(clv_values.mean()) if len(clv) else None,
        "mean_odds": float(bets["odds"].mean()),
        "mean_edge": float(bets["edge"].mean()),
    }
