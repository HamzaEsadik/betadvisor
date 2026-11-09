"""Team name normalization (FR-D11): every name maps to one code, unknown names fail."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from betadvisor.teams import TeamRegistry, UnknownTeamError, default_registry

REPO = Path(__file__).resolve().parents[2]
HEADER = "code,country,display_name,couk_names\n"


def test_default_registry_loads_with_unique_codes() -> None:
    reg = default_registry()
    assert len(reg) == len(reg.codes()) >= 120
    assert reg.sources == ("couk", "fdorg", "odds_api", "api_football")
    assert reg.team("PSG").display_name == "Paris Saint-Germain"


def test_known_names_map_to_codes() -> None:
    reg = default_registry()
    assert reg.code_for("couk", "Paris SG") == "PSG"
    assert reg.code_for("couk", "Nott'm Forest") == "NFO"
    assert reg.code_for("couk", "M'gladbach") == "BMG"
    assert reg.code_for("couk", "Ath Madrid") == "ATM"


def test_unknown_name_raises_and_lists_every_unknown() -> None:
    reg = default_registry()
    with pytest.raises(UnknownTeamError) as err:
        reg.codes_for("couk", ["Arsenal", "Arsenal FC", "Gunners"])
    assert err.value.names == ["Arsenal FC", "Gunners"]
    assert err.value.source == "couk"
    assert "teams.csv" in str(err.value)
    with pytest.raises(UnknownTeamError):
        reg.code_for("couk", "arsenal")  # matching is exact, never fuzzy


def test_unknown_source_and_code_raise() -> None:
    reg = default_registry()
    with pytest.raises(ValueError, match="no column for source"):
        reg.code_for("bet365", "Arsenal")
    with pytest.raises(ValueError, match="no column for source"):
        reg.lookup("bet365", "Arsenal")
    with pytest.raises(KeyError, match="unknown team code"):
        reg.team("XXX")


def test_feed_sample_codes_exist_in_registry() -> None:
    codes = default_registry().codes()
    used: set[str] = set()
    for path in (REPO / "feed-samples").glob("*/signals.json"):
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        for sig in doc.get("signals", []) if isinstance(doc, dict) else []:
            if isinstance(sig, dict):
                used.update(str(sig[k]) for k in ("home_code", "away_code") if k in sig)
    assert used, "no team codes found in feed samples"
    assert used <= codes, sorted(used - codes)


def test_aliases_are_split_on_pipe() -> None:
    reg = TeamRegistry(HEADER + "ARS,ENG,Arsenal,Arsenal|Arsenal FC\n")
    assert reg.code_for("couk", "Arsenal FC") == "ARS"


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ("ARS,ENG,Arsenal,Arsenal\nARS,ENG,Arsenal 2,Arsenal 2\n", "duplicate code"),
        ("ARS,ENG,Arsenal,Arsenal\nAFC,ENG,Arsenal FC,Arsenal\n", "already maps to"),
        ("ar,ENG,Arsenal,Arsenal\n", "invalid code"),
        ("ARS,USA,Arsenal,Arsenal\n", "invalid country"),
        ("ARS,ENG,,Arsenal\n", "empty display_name"),
    ],
)
def test_invalid_tables_are_rejected(rows: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        TeamRegistry(HEADER + rows)


def test_missing_columns_are_rejected() -> None:
    with pytest.raises(ValueError, match="missing columns"):
        TeamRegistry("code,couk_names\nARS,Arsenal\n")


def test_live_source_names_cover_current_season_clubs() -> None:
    """Every club in a 2026-27 league has a name for each live source (Part 5)."""
    reg = default_registry()
    for code in ("ARS", "SUN", "RMA", "OVI", "BAY", "SVE", "PSG", "LMFC"):
        for source in ("fdorg", "odds_api", "api_football"):
            names = [n for n, c in reg._by_name[source].items() if c == code]
            assert names, f"{code} has no {source} name"
    assert reg.lookup("fdorg", "FC Bayern München") == "BAY"
    assert reg.lookup("odds_api", "Paris Saint Germain") == "PSG"
    assert reg.lookup("fdorg", "Nobody FC") is None
