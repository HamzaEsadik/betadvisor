"""Command-line entry point (``betadvisor`` or ``python -m betadvisor``)."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Annotated

import typer

from betadvisor import __version__

app = typer.Typer(help="BetAdvisor data pipeline", no_args_is_help=True)
history_app = typer.Typer(help="Historical match data (football-data.co.uk)", no_args_is_help=True)
app.add_typer(history_app, name="history")

HISTORY_TABLE = "matches.csv"


@app.command()
def version() -> None:
    """Print the pipeline version."""
    typer.echo(__version__)


@app.callback()
def main() -> None:
    """BetAdvisor data pipeline."""


@history_app.command("fetch")
def history_fetch(
    cache_dir: Annotated[
        Path | None, typer.Option(help="Raw CSV cache (default: pipeline/.cache/history)")
    ] = None,
    refresh: Annotated[bool, typer.Option(help="Re-download past seasons too")] = False,
    today: Annotated[
        str | None, typer.Option(help="Treat this ISO date as today (picks the last season)")
    ] = None,
    league: Annotated[
        list[str] | None, typer.Option(help="League code (PL, PD, BL1, FL1); repeatable")
    ] = None,
) -> None:
    """Download season CSVs, normalize them, write matches.csv and print row counts."""
    from betadvisor.ingest.base import LEAGUE_CODES
    from betadvisor.ingest.football_data_couk import FootballDataCoUk
    from betadvisor.paths import history_dir

    leagues = [code for code in LEAGUE_CODES if league is None or code in league]
    unknown = set(league or []) - set(LEAGUE_CODES)
    if unknown:
        raise typer.BadParameter(f"unknown league(s): {sorted(unknown)}", param_hint="--league")
    source = FootballDataCoUk(
        cache_dir=cache_dir or history_dir(),
        today=date.fromisoformat(today) if today else date.today(),
        leagues=leagues,
    )
    downloaded = source.fetch(refresh=refresh)
    typer.echo(f"downloaded {len(downloaded)} file(s) into {source.cache_dir}")

    table = source.history()
    out = source.cache_dir / HISTORY_TABLE
    table.to_csv(out, index=False, date_format="%Y-%m-%d")

    counts = table.groupby(["season", "league"]).size().unstack("league", fill_value=0)
    counts = counts.reindex(columns=list(source.leagues), fill_value=0)
    counts["total"] = counts.sum(axis=1)
    typer.echo(counts.to_string())
    typer.echo(
        f"{len(table)} matches, {table['date'].min():%Y-%m-%d} to "
        f"{table['date'].max():%Y-%m-%d} -> {out}"
    )


@app.command()
def backtest(
    seasons: Annotated[
        str, typer.Option(help="Test seasons, e.g. 2022-23..2025-26")
    ] = "2022-23..2025-26",
    validation_seasons: Annotated[
        int, typer.Option(help="Seasons before the test range used to pick the blend weight")
    ] = 2,
    history: Annotated[
        Path | None,
        typer.Option(help="History table (default: pipeline/.cache/history/matches.csv)"),
    ] = None,
    out: Annotated[Path, typer.Option(help="Output directory")] = Path("docs/backtest"),
    min_train_matches: Annotated[
        int, typer.Option(help="Skip (league, month) windows with fewer earlier matches")
    ] = 200,
) -> None:
    """Walk-forward backtest: log loss, Brier, calibration and a simulated bankroll."""
    import dataclasses

    import pandas as pd

    from betadvisor.backtest.predict import DEFAULT_PREDICT
    from betadvisor.backtest.run import BacktestConfig, parse_seasons, run_backtest, write_outputs
    from betadvisor.paths import history_dir

    path = history or history_dir() / HISTORY_TABLE
    if not path.exists():
        raise typer.BadParameter(f"{path} not found; run `betadvisor history fetch` first")
    try:
        test_seasons = parse_seasons(seasons)
    except ValueError as exc:
        raise typer.BadParameter(str(exc), param_hint="--seasons") from exc
    table = pd.read_csv(path, parse_dates=["date"], dtype={"time": "string"})
    config = BacktestConfig(
        test_seasons=test_seasons,
        validation_seasons=validation_seasons,
        predict=dataclasses.replace(DEFAULT_PREDICT, min_train_matches=min_train_matches),
    )
    result = run_backtest(table, config)
    for written in write_outputs(result, out):
        typer.echo(f"wrote {written}")
    m = result.metrics
    scores = m["scores"]
    assert isinstance(scores, dict)
    typer.echo(f"blend weight (Dixon-Coles): {m['blend_weight_dc']}")
    for key in ("blend", "elo", "market_avg"):
        typer.echo(
            f"{key:>11}: log loss {scores[key]['log_loss']:.4f}  brier {scores[key]['brier']:.4f}"
            f"  (n={scores[key]['n']})"
        )
    bankroll = m["bankroll"]
    assert isinstance(bankroll, dict)
    for name, b in bankroll.items():
        roi = "n/a" if b["roi"] is None else f"{100 * b['roi']:+.1f}%"
        typer.echo(
            f"bankroll {name}: {b['bets']} bets, ROI {roi}, final ${b['final_cents'] / 100:,.2f}"
        )
