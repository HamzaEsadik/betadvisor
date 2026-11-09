"""Command-line entry point. Commands are added in later parts."""

import typer

from betadvisor import __version__

app = typer.Typer(help="BetAdvisor data pipeline", no_args_is_help=True)


@app.command()
def version() -> None:
    """Print the pipeline version."""
    typer.echo(__version__)


@app.callback()
def main() -> None:
    """BetAdvisor data pipeline."""
