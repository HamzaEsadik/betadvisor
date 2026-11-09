"""Command-line entry point (``betadvisor`` or ``python -m betadvisor``)."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any

import typer

from betadvisor import __version__

if TYPE_CHECKING:
    from betadvisor import runner as runner_types

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


# -- live runs (Part 5) --------------------------------------------------------------------------

DEFAULT_RECORDINGS = "tests/recordings/live"


def _load_env(path: Path) -> None:
    """Minimal ``KEY=value`` reader for ``pipeline/.env``; real environment variables win."""
    import os

    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _require_env(name: str) -> str:
    import os

    value = os.environ.get(name, "").strip()
    if not value:
        raise typer.BadParameter(f"{name} is not set (pipeline/.env or environment)")
    return value


def _build_sources(
    *,
    now: datetime,
    offline: bool,
    recordings: Path,
    record: Path | None,
    history: Path | None,
    odds_cache_ttl_min: int,
) -> runner_types.Sources:
    import os
    from datetime import timedelta

    import pandas as pd

    from betadvisor.ingest.api_football import ApiFootball
    from betadvisor.ingest.football_data_couk import FootballDataCoUk
    from betadvisor.ingest.football_data_org import FootballDataOrg
    from betadvisor.ingest.http import HttpClient, LiveHttp, RecordedHttp, RecordingHttp
    from betadvisor.ingest.odds_api import OddsApi
    from betadvisor.paths import PIPELINE_DIR, cache_dir, history_dir
    from betadvisor.runner import Sources

    _load_env(PIPELINE_DIR / ".env")
    http: HttpClient
    if offline:
        if not recordings.is_dir():
            raise typer.BadParameter(f"{recordings} is not a directory", param_hint="--recordings")
        http = RecordedHttp(recordings)
        fd_token = odds_key = "offline"
        has_af = any(recordings.glob("v3.football.api-sports.io*"))
        af_key: str | None = "offline" if has_af else None
        odds_cache = None
    else:
        http = LiveHttp()
        if record is not None:
            http = RecordingHttp(http, record)
        fd_token = _require_env("FOOTBALL_DATA_ORG_TOKEN")
        odds_key = _require_env("ODDS_API_KEY")
        af_key = os.environ.get("API_FOOTBALL_KEY", "").strip() or None
        odds_cache = cache_dir() / "odds_api"

    def load_history() -> pd.DataFrame:
        if history is not None or offline:
            path = history or history_dir() / HISTORY_TABLE
            if not path.exists():
                raise typer.BadParameter(f"{path} not found", param_hint="--history")
            return pd.read_csv(path, parse_dates=["date"], dtype={"time": "string"})
        source = FootballDataCoUk(cache_dir=history_dir(), today=now.date())
        source.fetch()
        table = source.history()
        table.to_csv(source.cache_dir / HISTORY_TABLE, index=False, date_format="%Y-%m-%d")
        return table

    return Sources(
        fixtures=FootballDataOrg(http, fd_token),
        odds=OddsApi(
            http,
            odds_key,
            now,
            cache_dir=odds_cache,
            cache_ttl=timedelta(minutes=odds_cache_ttl_min),
        ),
        injuries=ApiFootball(http, af_key),
        history=load_history,
    )


def _parse_now(value: str | None) -> datetime:
    from datetime import UTC

    if value is None:
        return datetime.now(UTC).replace(microsecond=0)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise typer.BadParameter("--now needs a timezone, e.g. 2026-11-09T06:00:00Z")
    return parsed.astimezone(UTC)


def _run(command: str, now_opt: str | None, out: Path, dry_run: bool, **kwargs: Any) -> None:
    import logging

    from betadvisor import runner
    from betadvisor.errors import PipelineError
    from betadvisor.publish.store import OutputStore
    from betadvisor.teams import UnknownTeamError

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    now = _parse_now(now_opt)
    try:
        sources = _build_sources(now=now, **kwargs)
        store = OutputStore(out)
        if command == "daily":
            report = runner.run_daily(sources, store, now, dry_run=dry_run)
        elif command == "results":
            report = runner.run_results(sources, store, now, dry_run=dry_run)
        else:
            report = runner.run_closing(sources, store, now, dry_run=dry_run)
    except (PipelineError, UnknownTeamError) as exc:
        typer.echo(f"ERROR: {exc}", err=True)
        typer.echo("Published files were left unchanged.", err=True)
        raise typer.Exit(code=1) from None
    for line in report.lines():
        typer.echo(line)


NowOpt = Annotated[str | None, typer.Option(help="Run as if it were this UTC time (ISO 8601)")]
OutOpt = Annotated[Path, typer.Option(help="Output root (feed/, archive/, odds/)")]
DryRunOpt = Annotated[bool, typer.Option(help="Build and validate, write nothing")]
OfflineOpt = Annotated[bool, typer.Option(help="Replay recorded API responses, no network")]
RecordingsOpt = Annotated[Path, typer.Option(help="Recorded responses used by --offline")]
RecordOpt = Annotated[Path | None, typer.Option(help="Save every live API response here")]
HistoryOpt = Annotated[
    Path | None, typer.Option(help="History table (default: fetch football-data.co.uk)")
]


@app.command("run-daily")
def run_daily_cmd(
    now: NowOpt = None,
    out: OutOpt = Path("out"),
    dry_run: DryRunOpt = False,
    offline: OfflineOpt = False,
    recordings: RecordingsOpt = Path(DEFAULT_RECORDINGS),
    record: RecordOpt = None,
    history: HistoryOpt = None,
) -> None:
    """Fixtures + odds + model -> signals.json, results.json and meta.json."""
    _run(
        "daily",
        now,
        out,
        dry_run,
        offline=offline,
        recordings=recordings,
        record=record,
        history=history,
        odds_cache_ttl_min=60,
    )


@app.command("run-results")
def run_results_cmd(
    now: NowOpt = None,
    out: OutOpt = Path("out"),
    dry_run: DryRunOpt = False,
    offline: OfflineOpt = False,
    recordings: RecordingsOpt = Path(DEFAULT_RECORDINGS),
    record: RecordOpt = None,
) -> None:
    """Results of the last 14 days, with closing odds -> results.json and meta.json."""
    _run(
        "results",
        now,
        out,
        dry_run,
        offline=offline,
        recordings=recordings,
        record=record,
        history=None,
        odds_cache_ttl_min=0,
    )


@app.command("run-closing")
def run_closing_cmd(
    now: NowOpt = None,
    out: OutOpt = Path("out"),
    dry_run: DryRunOpt = False,
    offline: OfflineOpt = False,
    recordings: RecordingsOpt = Path(DEFAULT_RECORDINGS),
    record: RecordOpt = None,
) -> None:
    """Snapshot pre-kickoff odds; the last snapshot before kickoff is the closing line."""
    _run(
        "closing",
        now,
        out,
        dry_run,
        offline=offline,
        recordings=recordings,
        record=record,
        history=None,
        odds_cache_ttl_min=10,
    )
