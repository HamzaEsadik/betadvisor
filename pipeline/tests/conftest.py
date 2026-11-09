from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from betadvisor.ingest.football_data_couk import FootballDataCoUk

FIXTURES = Path(__file__).parent / "fixtures"
COUK_FIXTURE = FIXTURES / "couk"
# With this "today" the fixture covers every season (2014-15 and the current 2015-16).
FIXTURE_TODAY = date(2016, 5, 1)


@pytest.fixture
def couk_cache(tmp_path: Path) -> Path:
    """A writable copy of the committed football-data.co.uk fixture (E0 only)."""
    dest = tmp_path / "history"
    shutil.copytree(COUK_FIXTURE, dest)
    return dest


@pytest.fixture
def fixture_history(couk_cache: Path) -> pd.DataFrame:
    source = FootballDataCoUk(cache_dir=couk_cache, today=FIXTURE_TODAY, leagues=("PL",))
    return source.history()
