"""Form strings (newest on the right, as in design 12) and rest days."""

from __future__ import annotations

import math

import pandas as pd
import pytest

from betadvisor.features import form, rest_days
from betadvisor.features.form import result_letter

# ARS results in date order: W, D, L, W, W, L, D
ARS_GAMES = [
    ("2024-08-10", "ARS", "CHE", 2, 0),
    ("2024-08-17", "LIV", "ARS", 1, 1),
    ("2024-08-24", "ARS", "TOT", 0, 1),
    ("2024-08-31", "MCI", "ARS", 0, 3),
    ("2024-09-14", "ARS", "EVE", 1, 0),
    ("2024-09-18", "NEW", "ARS", 2, 1),
    ("2024-09-21", "ARS", "FUL", 2, 2),
]


def frame(rows: list[tuple[str, str, str, int, int]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "season": "2024-25",
            "league": "PL",
            "date": pd.to_datetime([r[0] for r in rows]),
            "home_code": [r[1] for r in rows],
            "away_code": [r[2] for r in rows],
            "home_goals": [r[3] for r in rows],
            "away_goals": [r[4] for r in rows],
        }
    )


def ars_form(f: pd.DataFrame, data: pd.DataFrame) -> list[str]:
    return [
        f.loc[i, "home_form"] if data.loc[i, "home_code"] == "ARS" else f.loc[i, "away_form"]
        for i in data.index
    ]


def test_result_letter() -> None:
    assert [result_letter(2, 0), result_letter(1, 1), result_letter(0, 1)] == ["W", "D", "L"]


def test_form_is_oldest_first_newest_right_and_capped_at_five() -> None:
    data = frame(ARS_GAMES)
    assert ars_form(form(data), data) == ["", "W", "WD", "WDL", "WDLW", "WDLWW", "DLWWL"]


def test_form_from_the_away_side_perspective() -> None:
    data = frame(ARS_GAMES[:2] + [("2024-08-24", "CHE", "LIV", 0, 0)])
    f = form(data)
    assert f.loc[1, "home_form"] == ""  # LIV before its first match
    assert f.loc[2, "home_form"] == "L"  # CHE lost 0-2 at ARS
    assert f.loc[2, "away_form"] == "D"  # LIV drew with ARS


def test_form_custom_length_and_validation() -> None:
    data = frame(ARS_GAMES)
    assert ars_form(form(data, length=2), data)[-1] == "WL"
    with pytest.raises(ValueError):
        form(data, length=0)


def test_form_keeps_input_index_when_shuffled() -> None:
    data = frame(ARS_GAMES)
    shuffled = data.iloc[::-1]
    pd.testing.assert_frame_equal(form(shuffled).sort_index(), form(data))


def test_rest_days() -> None:
    data = frame(ARS_GAMES)
    r = rest_days(data)
    side = ["home" if code == "ARS" else "away" for code in data["home_code"]]
    ars = [r.loc[i, f"{s}_rest_days"] for i, s in zip(data.index, side, strict=True)]
    assert math.isnan(ars[0])
    assert ars[1:] == [7, 7, 7, 14, 4, 3]
    assert math.isnan(r.loc[0, "away_rest_days"])  # CHE has no previous match
