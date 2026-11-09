"""Walk-forward predictions are leak-free; the backtest runs end to end on fixture data."""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from typer.testing import CliRunner

from betadvisor.backtest.predict import DC_COLS, ELO_COLS, PredictConfig, walk_forward_predictions
from betadvisor.backtest.run import BacktestConfig, run_backtest, write_outputs
from betadvisor.cli import app
from tests.models.synthetic import simulate_league

SMALL = PredictConfig(min_train_matches=5)


def test_predictions_ignore_future_matches() -> None:
    matches, _, _, _ = simulate_league(seasons=3, n_teams=10)
    full = walk_forward_predictions(matches, ["2016-17"], PredictConfig(min_train_matches=50))
    cutoff = pd.Timestamp("2016-11-01")
    truncated = walk_forward_predictions(
        matches[matches["date"] < cutoff], ["2016-17"], PredictConfig(min_train_matches=50)
    )
    before = full[full["date"] < cutoff]
    assert len(before) == len(truncated) > 0
    cols = DC_COLS + ELO_COLS
    np.testing.assert_allclose(before[cols].to_numpy(), truncated[cols].to_numpy(), rtol=1e-12)
    probs = full[cols].to_numpy().reshape(-1, 2, 3).sum(axis=2)
    np.testing.assert_allclose(probs, 1.0, atol=1e-9)


def test_no_predictions_fails_loudly() -> None:
    matches, _, _, _ = simulate_league(seasons=1, n_teams=6)
    with pytest.raises(ValueError, match="no predictions"):
        walk_forward_predictions(matches, ["2014-15"], PredictConfig(min_train_matches=10_000))


def smoke_config() -> BacktestConfig:
    return BacktestConfig(test_seasons=["2015-16"], validation_seasons=1, predict=SMALL)


def test_backtest_smoke_on_fixture(fixture_history: pd.DataFrame, tmp_path: Path) -> None:
    result = run_backtest(fixture_history, smoke_config())
    m = result.metrics
    assert m["model_version"] == "dc-elo-0.1.0"
    assert m["validation_seasons"] == ["2014-15"]
    matches = m["matches"]
    assert isinstance(matches, dict)
    assert matches["test_predicted"] == 12
    assert matches["dc_missing_elo_fallback"] > 0  # Watford is new in 2015-16
    scores = m["scores"]
    assert isinstance(scores, dict)
    for key in ("blend", "elo", "market_avg"):
        assert 0 < scores[key]["log_loss"] < 3 and 0 <= scores[key]["brier"] <= 2

    written = write_outputs(result, tmp_path / "out")
    assert sorted(p.name for p in written) == [
        "bankroll.png",
        "calibration.png",
        "metrics.json",
        "report.md",
    ]
    for p in written:
        assert p.stat().st_size > 0
    report = (tmp_path / "out" / "report.md").read_text()
    for needle in ("Log loss", "Brier", "calibration.png", "bankroll.png", "Market"):
        assert needle in report
    assert json.loads((tmp_path / "out" / "metrics.json").read_text())["seed"] == 20261109


def test_backtest_rejects_missing_seasons(fixture_history: pd.DataFrame) -> None:
    config = dataclasses.replace(smoke_config(), test_seasons=["2016-17"])
    with pytest.raises(ValueError, match="not in the history"):
        run_backtest(fixture_history, config)


def test_cli_backtest(fixture_history: pd.DataFrame, tmp_path: Path) -> None:
    table = tmp_path / "matches.csv"
    fixture_history.to_csv(table, index=False, date_format="%Y-%m-%d")
    out = tmp_path / "bt"
    args = [
        "backtest",
        "--seasons",
        "2015-16",
        "--validation-seasons",
        "1",
        "--history",
        str(table),
        "--out",
        str(out),
        "--min-train-matches",
        "5",
    ]
    result = CliRunner().invoke(app, args)
    assert result.exit_code == 0, result.output
    assert "log loss" in result.output
    assert (out / "report.md").exists()

    bad = CliRunner().invoke(app, ["backtest", "--seasons", "2015-17", "--history", str(table)])
    assert bad.exit_code != 0 and "bad season" in bad.output
    missing = CliRunner().invoke(app, ["backtest", "--history", str(tmp_path / "nope.csv")])
    assert missing.exit_code != 0
