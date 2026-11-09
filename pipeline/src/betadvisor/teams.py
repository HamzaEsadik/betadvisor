"""Team identity: one canonical code per club, mapped to the names each source uses (FR-D11).

``data/teams.csv`` has one row per club: ``code``, ``country``, ``display_name`` and one
``<source>_names`` column per data source (aliases separated by ``|``). Looking up a name that
is not in the table raises :class:`UnknownTeamError`; nothing is ever guessed.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from functools import cache
from importlib import resources

TEAM_CODE_PATTERN = re.compile(r"^[A-Z0-9]{2,5}$")
COUNTRIES = frozenset({"ENG", "ESP", "GER", "FRA"})
NAME_COLUMN_SUFFIX = "_names"


class UnknownTeamError(LookupError):
    """A source used a team name that ``teams.csv`` does not know."""

    def __init__(self, source: str, names: list[str]) -> None:
        self.source = source
        self.names = sorted(set(names))
        super().__init__(
            f"unknown team name(s) for source {source!r}: {', '.join(map(repr, self.names))}. "
            "Add them to pipeline/src/betadvisor/data/teams.csv."
        )


@dataclass(frozen=True, slots=True)
class Team:
    code: str
    country: str
    display_name: str


class TeamRegistry:
    """Validated in-memory view of ``teams.csv``."""

    def __init__(self, csv_text: str) -> None:
        reader = csv.DictReader(io.StringIO(csv_text))
        fields = reader.fieldnames or []
        missing = {"code", "country", "display_name"} - set(fields)
        if missing:
            raise ValueError(f"teams.csv is missing columns: {sorted(missing)}")
        self.sources: tuple[str, ...] = tuple(
            f.removesuffix(NAME_COLUMN_SUFFIX) for f in fields if f.endswith(NAME_COLUMN_SUFFIX)
        )
        self._teams: dict[str, Team] = {}
        self._by_name: dict[str, dict[str, str]] = {s: {} for s in self.sources}

        for line, row in enumerate(reader, start=2):
            code = row["code"].strip()
            country = row["country"].strip()
            if not TEAM_CODE_PATTERN.match(code):
                raise ValueError(f"teams.csv line {line}: invalid code {code!r}")
            if country not in COUNTRIES:
                raise ValueError(f"teams.csv line {line}: invalid country {country!r}")
            if code in self._teams:
                raise ValueError(f"teams.csv line {line}: duplicate code {code!r}")
            display = row["display_name"].strip()
            if not display:
                raise ValueError(f"teams.csv line {line}: empty display_name")
            self._teams[code] = Team(code, country, display)
            for source in self.sources:
                cell = (row[source + NAME_COLUMN_SUFFIX] or "").strip()
                for name in filter(None, (n.strip() for n in cell.split("|"))):
                    known = self._by_name[source].get(name)
                    if known is not None and known != code:
                        raise ValueError(
                            f"teams.csv line {line}: {source} name {name!r} already maps to "
                            f"{known!r}"
                        )
                    self._by_name[source][name] = code

    def __len__(self) -> int:
        return len(self._teams)

    def team(self, code: str) -> Team:
        try:
            return self._teams[code]
        except KeyError:
            raise KeyError(f"unknown team code {code!r}") from None

    def codes(self) -> frozenset[str]:
        return frozenset(self._teams)

    def code_for(self, source: str, name: str) -> str:
        """Canonical code for ``name`` as written by ``source``. Raises if unknown."""
        return self.codes_for(source, [name])[name]

    def codes_for(self, source: str, names: list[str]) -> dict[str, str]:
        """Map every name to its code, reporting *all* unknown names in one error."""
        try:
            table = self._by_name[source]
        except KeyError:
            raise ValueError(f"teams.csv has no column for source {source!r}") from None
        unknown = [n for n in names if n not in table]
        if unknown:
            raise UnknownTeamError(source, unknown)
        return {n: table[n] for n in names}


@cache
def default_registry() -> TeamRegistry:
    """The registry bundled with the package (``betadvisor/data/teams.csv``)."""
    text = resources.files("betadvisor").joinpath("data/teams.csv").read_text(encoding="utf-8")
    return TeamRegistry(text)
