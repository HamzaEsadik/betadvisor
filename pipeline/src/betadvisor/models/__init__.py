"""Match outcome models: Dixon-Coles, Elo ordered logit, their blend, and the shot stacker.

``MODEL_VERSION`` is the model the daily run publishes (``models.live``); ``BLEND_VERSION`` is
the Part 6 blend it builds on. ``docs/backtest/report.md`` compares them.
"""

from betadvisor.models.blend import BLEND_VERSION
from betadvisor.models.stack import STACK_VERSION

MODEL_VERSION = STACK_VERSION

__all__ = ["BLEND_VERSION", "MODEL_VERSION"]
