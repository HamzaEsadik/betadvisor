"""Walk-forward backtest (FR-D12, SRS 6.7, AC-10).

1. Monthly walk-forward predictions (``predict``) for the validation and the test seasons.
2. The Dixon-Coles / Elo blend weight is chosen on the validation seasons only.
3. On the test seasons: log loss and Brier score for Dixon-Coles, Elo, the blend and the
   de-vigged market (pre-match average odds, plus Pinnacle closing where it exists), calibration
   bins, and a bankroll simulated with the real decision engine.
4. ``report.md``, ``metrics.json``, ``calibration.png`` and ``bankroll.png`` are written.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd

from betadvisor.backtest.bankroll import (
    DEFAULT_BANKROLL,
    BankrollConfig,
    BankrollResult,
    flat_stake,
    simulate,
    summarize,
)
from betadvisor.backtest.predict import (
    DC_COLS,
    DEFAULT_PREDICT,
    ELO_COLS,
    PredictConfig,
    walk_forward_predictions,
)
from betadvisor.decision.devig import proportional
from betadvisor.models.blend import MODEL_VERSION, blend, choose_weight
from betadvisor.models.metrics import brier, calibration_bins, log_loss

FloatArray = npt.NDArray[np.float64]

BLEND_COLS = ["blend_home", "blend_draw", "blend_away"]
MARKET_COLS = ["mkt_home", "mkt_draw", "mkt_away"]
AVG_ODDS = ["avg_home", "avg_draw", "avg_away"]
AVG_CLOSE = ["avg_close_home", "avg_close_draw", "avg_close_away"]
PS_CLOSE = ["ps_close_home", "ps_close_draw", "ps_close_away"]
SEED = 20261109

_SEASON = re.compile(r"^(\d{4})-(\d{2})$")


def season_label(start: int) -> str:
    return f"{start}-{(start + 1) % 100:02d}"


def parse_season(label: str) -> int:
    m = _SEASON.match(label)
    if not m or (int(m.group(1)) + 1) % 100 != int(m.group(2)):
        raise ValueError(f"bad season {label!r}, expected like 2022-23")
    return int(m.group(1))


def parse_seasons(spec: str) -> list[str]:
    """``"2022-23..2025-26"`` or a single ``"2024-25"`` to the list of season labels."""
    first, _, last = spec.partition("..")
    a, b = parse_season(first), parse_season(last or first)
    if b < a:
        raise ValueError(f"season range {spec!r} is reversed")
    return [season_label(y) for y in range(a, b + 1)]


@dataclass(frozen=True, slots=True)
class BacktestConfig:
    test_seasons: list[str]
    validation_seasons: int = 2
    predict: PredictConfig = DEFAULT_PREDICT
    bankroll: BankrollConfig = DEFAULT_BANKROLL
    seed: int = SEED
    calibration_bins: int = 10


@dataclass(frozen=True, slots=True)
class BacktestResult:
    metrics: dict[str, object]
    test: pd.DataFrame
    sims: dict[str, BankrollResult]


def _devig_rows(frame: pd.DataFrame, cols: list[str]) -> FloatArray:
    out = np.full((len(frame), 3), np.nan)
    values = frame[cols].to_numpy(dtype=np.float64)
    for i, odds in enumerate(values):
        if np.isfinite(odds).all() and (odds > 1).all():
            out[i] = proportional(odds.tolist())
    return out


def _add_blend(frame: pd.DataFrame, weight: float) -> pd.DataFrame:
    out = frame.copy()
    dc = out[DC_COLS].to_numpy(dtype=np.float64)
    elo = out[ELO_COLS].to_numpy(dtype=np.float64)
    has_dc = np.isfinite(dc).all(axis=1)
    mixed = elo.copy()
    mixed[has_dc] = blend(dc[has_dc], elo[has_dc], weight)
    out[BLEND_COLS] = mixed
    out["dc_missing"] = ~has_dc
    out[MARKET_COLS] = _devig_rows(out, AVG_ODDS)
    return out


def _scores(frame: pd.DataFrame, cols: list[str]) -> dict[str, float]:
    probs = frame[cols].to_numpy(dtype=np.float64)
    outcome = frame["outcome"].to_numpy(dtype=np.int64)
    return {"log_loss": log_loss(probs, outcome), "brier": brier(probs, outcome), "n": len(frame)}


def _bins(frame: pd.DataFrame, cols: list[str], n: int) -> list[dict[str, object]]:
    probs = frame[cols].to_numpy(dtype=np.float64)
    outcome = frame["outcome"].to_numpy(dtype=np.int64)
    return [
        {
            "lower": b.lower,
            "upper": b.upper,
            "count": b.count,
            "mean_predicted": b.mean_predicted,
            "observed": b.observed,
        }
        for b in calibration_bins(probs, outcome, n)
    ]


def run_backtest(history: pd.DataFrame, config: BacktestConfig) -> BacktestResult:
    first_test = parse_season(config.test_seasons[0])
    validation = [season_label(first_test - k) for k in range(config.validation_seasons, 0, -1)]
    available = set(history["season"])
    missing = [s for s in validation + config.test_seasons if s not in available]
    if missing:
        raise ValueError(f"seasons not in the history table: {missing}")

    preds = walk_forward_predictions(history, validation + config.test_seasons, config.predict)
    val = preds[preds["season"].isin(validation)]
    val_dc = val[np.isfinite(val[DC_COLS].to_numpy(dtype=np.float64)).all(axis=1)]
    if val_dc.empty:
        raise ValueError(f"no validation predictions in {validation} to choose the blend weight")
    weight = choose_weight(
        val_dc[DC_COLS].to_numpy(dtype=np.float64),
        val_dc[ELO_COLS].to_numpy(dtype=np.float64),
        val_dc["outcome"].to_numpy(dtype=np.int64),
    )

    test = _add_blend(preds[preds["season"].isin(config.test_seasons)], weight)
    if test.empty:
        raise ValueError(f"no test predictions for {config.test_seasons}")
    has_market = np.isfinite(test[MARKET_COLS].to_numpy(dtype=np.float64)).all(axis=1)
    common = test[has_market & ~test["dc_missing"]]
    scored = test[has_market]

    scores: dict[str, object] = {
        "blend": _scores(scored, BLEND_COLS),
        "elo": _scores(scored, ELO_COLS),
        "market_avg": _scores(scored, MARKET_COLS),
    }
    if not common.empty:
        scores["dc_only_subset"] = {
            "dixon_coles": _scores(common, DC_COLS),
            "blend": _scores(common, BLEND_COLS),
            "market_avg": _scores(common, MARKET_COLS),
        }
    ps = _devig_rows(scored, PS_CLOSE)
    has_ps = np.isfinite(ps).all(axis=1)
    if has_ps.any():
        sub = scored[has_ps].copy()
        sub[["ps_c_home", "ps_c_draw", "ps_c_away"]] = ps[has_ps]
        scores["pinnacle_close_subset"] = {
            "blend": _scores(sub, BLEND_COLS),
            "market_avg": _scores(sub, MARKET_COLS),
            "pinnacle_close": _scores(sub, ["ps_c_home", "ps_c_draw", "ps_c_away"]),
        }

    by_league: dict[str, object] = {}
    for league, rows in scored.groupby("league", sort=True):
        by_league[str(league)] = {
            "blend": _scores(rows, BLEND_COLS),
            "market_avg": _scores(rows, MARKET_COLS),
        }

    sims = {
        "pre_match_avg": simulate(test, BLEND_COLS, AVG_ODDS, AVG_CLOSE, config.bankroll),
        "closing_avg": simulate(test, BLEND_COLS, AVG_CLOSE, None, config.bankroll),
    }
    bankroll = {name: summarize(sim, config.bankroll, config.seed) for name, sim in sims.items()}
    flat = flat_stake(test, BLEND_COLS, AVG_ODDS, config.bankroll.decision, config.seed)

    metrics: dict[str, object] = {
        "model_version": MODEL_VERSION,
        "test_seasons": config.test_seasons,
        "validation_seasons": validation,
        "blend_weight_dc": weight,
        "seed": config.seed,
        "matches": {
            "test_predicted": len(test),
            "scored_with_market": len(scored),
            "dc_missing_elo_fallback": int(test["dc_missing"].sum()),
            "validation_predicted": len(val),
        },
        "scores": scores,
        "scores_by_league": by_league,
        "calibration": {
            "blend": _bins(scored, BLEND_COLS, config.calibration_bins),
            "market_avg": _bins(scored, MARKET_COLS, config.calibration_bins),
        },
        "bankroll": bankroll,
        "flat_stake_pre_match_avg": flat,
        "config": {
            "min_train_matches": config.predict.min_train_matches,
            "dixon_coles": config.predict.dc.to_dict(),
            "elo": config.predict.elo.to_dict(),
            "decision": config.bankroll.decision.to_dict(),
            "daily_cap": config.bankroll.daily_cap,
            "min_stake_cents": config.bankroll.min_stake_cents,
            "start_cents": config.bankroll.start_cents,
        },
    }
    return BacktestResult(metrics=metrics, test=test, sims=sims)


def write_outputs(result: BacktestResult, out_dir: Path) -> list[Path]:
    from betadvisor.backtest.report import plot_bankroll, plot_calibration, render_report

    out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = out_dir / "metrics.json"
    metrics_path.write_text(json.dumps(result.metrics, indent=2, default=str) + "\n")
    cal = out_dir / "calibration.png"
    plot_calibration(result.metrics, cal)
    bank = out_dir / "bankroll.png"
    plot_bankroll(result.sims, result.metrics, bank)
    report = out_dir / "report.md"
    report.write_text(render_report(result.metrics))
    return [report, metrics_path, cal, bank]
