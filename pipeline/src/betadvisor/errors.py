"""Errors that stop a pipeline run (FR-D11): the CLI turns them into a non-zero exit."""

from __future__ import annotations


class PipelineError(RuntimeError):
    """A run cannot produce a trustworthy feed. Previously published files stay untouched."""


class SourceError(PipelineError):
    """An external data source failed or returned something unusable."""


class QuotaExhaustedError(SourceError):
    """A paid-quota source is below its reserve, so the call was not made."""


class FeedValidationError(PipelineError):
    """A built feed file breaks its JSON Schema or a cross-field rule."""
