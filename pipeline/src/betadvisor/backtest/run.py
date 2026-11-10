"""Walk-forward backtest (FR-D12, SRS 6.7, AC-10).

1. Monthly walk-forward predictions (``predict``) for the validation and the test seasons.
   Every season before the test seasons is predicted, so later months have out-of-sample
   training rows for the second stage.
2. The Dixon-Coles / Elo blend weight is chosen on the validation seasons only.
3. Second stage (Part 18, ``candidates``): the shot stacker and the boosted model, refitted every
   month. The candidate with the lower validation log loss is chosen; it replaces the blend only
   if its test log loss is lower too ("shipped"). "Model" below is the shipped forecast.
4. On the test seasons: log loss and Brier score for Dixon-Coles, Elo, the blend and the
   de-vigged market (pre-match average odds, plus Pinnacle closing where it exists), calibration
   bins, and a bankroll simulated with the real decision engine.
5. ``report.md``, ``metrics.json``, ``calibration.png`` and ``bankroll.png`` are written.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
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
from betadvisor.backtest.candidates import (
    BOOSTED_COLS,
    DEFAULT_STAGE_TWO,
    STACK_COLS,
    StageTwoConfig,
    add_shot_rates,
    stage_two_predictions,
)
from betadvisor.backtest.predict import (
    DC_COLS,
    DEFAULT_PREDICT,
    ELO_COLS,
    PredictConfig,
    walk_forward_predictions,
)
from betadvisor.decision.devig import proportional
from betadvisor.models.blend import BLEND_VERSION, blend, choose_weight
from betadvisor.models.metrics import brier, calibration_bins, log_loss
from betadvisor.models.stack import BOOSTED_VERSION, STACK_VERSION

FloatArray = npt.NDArray[np.float64]

BLEND_COLS = ["blend_home", "blend_draw", "blend_away"]
MARKET_COLS = ["mkt_home", "mkt_draw", "mkt_away"]
AVG_ODDS = ["avg_home", "avg_draw", "avg_away"]
AVG_CLOSE = ["avg_close_home", "avg_close_draw", "avg_close_away"]
PS_CLOSE = ["ps_close_home", "ps_close_draw", "ps_close_away"]
SEED = 20261109
CANDIDATE_VERSIONS = {"stack": STACK_VERSION, "boosted": BOOSTED_VERSION}

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
    stage_two: StageTwoConfig = DEFAULT_STAGE_TWO
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


def _candidate_scores(
    frame: pd.DataFrame, names: dict[str, list[str]]
) -> dict[str, dict[str, float]]:
    return {name: _scores(frame, cols) for name, cols in names.items()}


def run_backtest(history: pd.DataFrame, config: BacktestConfig) -> BacktestResult:
    first_test = parse_season(config.test_seasons[0])
    validation = [season_label(first_test - k) for k in range(config.validation_seasons, 0, -1)]
    available = set(history["season"])
    missing = [s for s in validation + config.test_seasons if s not in available]
    if missing:
        raise ValueError(f"seasons not in the history table: {missing}")
    evaluated = validation + config.test_seasons
    # Every earlier season is predicted too: those walk-forward rows train the second stage.
    predicted = sorted(s for s in available if s <= config.test_seasons[-1])

    preds = walk_forward_predictions(history, predicted, config.predict)
    val = preds[preds["season"].isin(validation)]
    val_dc = val[np.isfinite(val[DC_COLS].to_numpy(dtype=np.float64)).all(axis=1)]
    if val_dc.empty:
        raise ValueError(f"no validation predictions in {validation} to choose the blend weight")
    weight = choose_weight(
        val_dc[DC_COLS].to_numpy(dtype=np.float64),
        val_dc[ELO_COLS].to_numpy(dtype=np.float64),
        val_dc["outcome"].to_numpy(dtype=np.int64),
    )

    blended = add_shot_rates(_add_blend(preds, weight), history, config.stage_two.shot_decay)
    staged = stage_two_predictions(blended, BLEND_COLS, evaluated, config.stage_two)
    staged_val = staged[staged["season"].isin(validation)]
    test = staged[staged["season"].isin(config.test_seasons)]
    if test.empty:
        raise ValueError(f"no test predictions for {config.test_seasons}")

    # Candidate choice on the validation seasons only; shipping needs a better test log loss.
    names = {"blend": BLEND_COLS, "stack": STACK_COLS, "boosted": BOOSTED_COLS}
    val_market = np.isfinite(staged_val[MARKET_COLS].to_numpy(dtype=np.float64)).all(axis=1)
    val_scored = staged_val[val_market]
    if val_scored.empty:
        raise ValueError(f"no validation matches with market odds in {validation}")
    has_market = np.isfinite(test[MARKET_COLS].to_numpy(dtype=np.float64)).all(axis=1)
    scored = test[has_market]
    cand_val = _candidate_scores(val_scored, {**names, "market_avg": MARKET_COLS})
    cand_test = _candidate_scores(scored, {**names, "market_avg": MARKET_COLS})
    chosen = min(("stack", "boosted"), key=lambda k: cand_val[k]["log_loss"])
    shipped = cand_test[chosen]["log_loss"] < cand_test["blend"]["log_loss"]
    model_cols = names[chosen] if shipped else BLEND_COLS
    model_version = CANDIDATE_VERSIONS[chosen] if shipped else BLEND_VERSION

    common = test[has_market & ~test["dc_missing"]]
    scores: dict[str, object] = {
        "model": _scores(scored, model_cols),
        "blend": _scores(scored, BLEND_COLS),
        "elo": _scores(scored, ELO_COLS),
        "market_avg": _scores(scored, MARKET_COLS),
    }
    if not common.empty:
        scores["dc_only_subset"] = {
            "dixon_coles": _scores(common, DC_COLS),
            "model": _scores(common, model_cols),
            "market_avg": _scores(common, MARKET_COLS),
        }
    ps = _devig_rows(scored, PS_CLOSE)
    has_ps = np.isfinite(ps).all(axis=1)
    if has_ps.any():
        sub = scored[has_ps].copy()
        sub[["ps_c_home", "ps_c_draw", "ps_c_away"]] = ps[has_ps]
        scores["pinnacle_close_subset"] = {
            "model": _scores(sub, model_cols),
            "market_avg": _scores(sub, MARKET_COLS),
            "pinnacle_close": _scores(sub, ["ps_c_home", "ps_c_draw", "ps_c_away"]),
        }

    by_league: dict[str, object] = {}
    for league, rows in scored.groupby("league", sort=True):
        by_league[str(league)] = {
            "model": _scores(rows, model_cols),
            "blend": _scores(rows, BLEND_COLS),
            "market_avg": _scores(rows, MARKET_COLS),
        }

    sims = {
        "pre_match_avg": simulate(test, model_cols, AVG_ODDS, AVG_CLOSE, config.bankroll),
        "closing_avg": simulate(test, model_cols, AVG_CLOSE, None, config.bankroll),
    }
    bankroll = {name: summarize(sim, config.bankroll, config.seed) for name, sim in sims.items()}
    flat = flat_stake(test, model_cols, AVG_ODDS, config.bankroll.decision, config.seed)
    flat_by_candidate = {
        name: flat_stake(test, cols, AVG_ODDS, config.bankroll.decision, config.seed)
        for name, cols in names.items()
    }

    metrics: dict[str, object] = {
        "model_version": model_version,
        "test_seasons": config.test_seasons,
        "validation_seasons": validation,
        "blend_weight_dc": weight,
        "seed": config.seed,
        "candidates": {
            "versions": {"blend": BLEND_VERSION, **CANDIDATE_VERSIONS},
            "validation": cand_val,
            "test": cand_test,
            "chosen": chosen,
            "shipped": bool(shipped),
            "flat_stake_pre_match_avg": flat_by_candidate,
        },
        "matches": {
            "test_predicted": len(test),
            "scored_with_market": len(scored),
            "dc_missing_elo_fallback": int(test["dc_missing"].sum()),
            "stage2_fallback": int(test["stage2_fallback"].sum()),
            "validation_predicted": len(val),
            "stage2_training_seasons": [s for s in predicted if s not in evaluated],
        },
        "scores": scores,
        "scores_by_league": by_league,
        "calibration": {
            "model": _bins(scored, model_cols, config.calibration_bins),
            "market_avg": _bins(scored, MARKET_COLS, config.calibration_bins),
        },
        "bankroll": bankroll,
        "flat_stake_pre_match_avg": flat,
        "config": {
            "min_train_matches": config.predict.min_train_matches,
            "dixon_coles": config.predict.dc.to_dict(),
            "elo": config.predict.elo.to_dict(),
            "stage_two": {
                "min_train_rows": config.stage_two.min_train_rows,
                "shot_decay": config.stage_two.shot_decay,
                "boosted": asdict(config.stage_two.boosted),
            },
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
