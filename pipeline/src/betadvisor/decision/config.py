"""Decision engine thresholds (FR-D5, FR-D6, SRS 6.3), kept in one place."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

DevigMethod = Literal["proportional", "shin"]


@dataclass(frozen=True, slots=True)
class DecisionConfig:
    """Every threshold the decision engine uses. Defaults follow SRS 6.3 and FR-D5."""

    min_edge: float = 0.04
    min_odds: float = 1.40
    max_odds: float = 6.00
    kelly_multiplier: float = 0.25
    per_bet_cap: float = 0.05
    max_odds_age_hours: float = 12.0
    # A signal flagged `low_data` needs an edge of at least this multiple of `min_edge`.
    low_confidence_edge_multiple: float = 2.0
    devig_method: DevigMethod = "proportional"

    def __post_init__(self) -> None:
        if not 0 < self.min_edge < 1:
            raise ValueError(f"min_edge must be in (0, 1), got {self.min_edge}")
        if not 1 < self.min_odds < self.max_odds:
            raise ValueError(f"need 1 < min_odds < max_odds, got {self.min_odds}, {self.max_odds}")
        if not 0 < self.kelly_multiplier <= 1:
            raise ValueError(f"kelly_multiplier must be in (0, 1], got {self.kelly_multiplier}")
        if not 0 < self.per_bet_cap <= 1:
            raise ValueError(f"per_bet_cap must be in (0, 1], got {self.per_bet_cap}")
        if self.max_odds_age_hours <= 0:
            raise ValueError(f"max_odds_age_hours must be > 0, got {self.max_odds_age_hours}")
        if self.low_confidence_edge_multiple < 1:
            raise ValueError(
                "low_confidence_edge_multiple must be >= 1, "
                f"got {self.low_confidence_edge_multiple}"
            )
        if self.devig_method not in ("proportional", "shin"):
            raise ValueError(f"unknown devig_method {self.devig_method!r}")

    def to_dict(self) -> dict[str, float | str]:
        """Plain JSON-ready dict, for publishing alongside the feed metadata."""
        return asdict(self)


DEFAULT_CONFIG = DecisionConfig()
