"""JSON-over-HTTP clients shared by the live adapters: live, recording, and replay.

Every adapter talks to an :class:`HttpClient`. ``LiveHttp`` calls the network,
``RecordingHttp`` wraps another client and saves each response to disk, and ``RecordedHttp``
replays saved responses (``--offline`` and the tests). Secrets (API keys in query parameters
or headers) are never written into recordings.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

import requests

from betadvisor.errors import SourceError

REQUEST_TIMEOUT_S = 30
# Query parameters that carry secrets: excluded from recording keys and files.
SECRET_PARAMS = frozenset({"apiKey", "api_key", "token"})
# Response headers worth keeping in a recording (quota counters).
KEPT_HEADERS = ("x-requests-remaining", "x-requests-used", "x-requests-last")
# Rate limits (football-data.org free tier: 10 requests/minute): wait and retry, then fail loudly.
MAX_RATE_LIMIT_RETRIES = 2
MAX_RETRY_WAIT_S = 65

Params = Mapping[str, str]


@dataclass(frozen=True, slots=True)
class HttpResult:
    status: int
    headers: Mapping[str, str]
    body: Any


class HttpClient(Protocol):
    def get_json(
        self, url: str, params: Params | None = None, headers: Params | None = None
    ) -> HttpResult: ...


class RecordingMissingError(SourceError):
    """``--offline`` asked for a response that was never recorded."""


def public_params(params: Params | None) -> dict[str, str]:
    return {k: v for k, v in sorted((params or {}).items()) if k not in SECRET_PARAMS}


def recording_name(url: str, params: Params | None) -> str:
    """Stable, readable file name for one request (secrets excluded)."""
    parts = urlsplit(url)
    key = parts.netloc + parts.path
    query = "_".join(f"{k}={v}" for k, v in public_params(params).items())
    if query:
        key += "__" + query
    return re.sub(r"[^A-Za-z0-9=._-]+", "_", key).strip("_") + ".json"


def retry_after_seconds(resp: requests.Response) -> float:
    """Seconds a rate-limited (429) response asks us to wait, capped at ``MAX_RETRY_WAIT_S``.

    football-data.org sends ``X-RequestCounter-Reset`` and a "Wait N seconds" message;
    others send ``Retry-After``. Unknown → a full minute (the free tiers count per minute).
    """
    for header in ("Retry-After", "X-RequestCounter-Reset"):
        value = resp.headers.get(header)
        if value is not None and value.strip().isdigit():
            return float(min(int(value) + 1, MAX_RETRY_WAIT_S))
    match = re.search(r"[Ww]ait (\d+) second", resp.text)
    if match:
        return float(min(int(match.group(1)) + 1, MAX_RETRY_WAIT_S))
    return float(MAX_RETRY_WAIT_S)


@dataclass
class LiveHttp:
    session: requests.Session = field(default_factory=requests.Session)
    timeout: float = REQUEST_TIMEOUT_S
    max_retries: int = MAX_RATE_LIMIT_RETRIES
    sleep: Callable[[float], None] = time.sleep

    def get_json(
        self, url: str, params: Params | None = None, headers: Params | None = None
    ) -> HttpResult:
        """GET ``url``; a 429 is retried after the wait the server asks for, then reported."""
        resp = self._get(url, params, headers)
        for _ in range(self.max_retries):
            if resp.status_code != 429:
                break
            self.sleep(retry_after_seconds(resp))
            resp = self._get(url, params, headers)
        try:
            body: Any = resp.json()
        except ValueError:
            body = resp.text[:500]
        kept = {h: resp.headers[h] for h in KEPT_HEADERS if h in resp.headers}
        return HttpResult(resp.status_code, kept, body)

    def _get(self, url: str, params: Params | None, headers: Params | None) -> requests.Response:
        try:
            resp = self.session.get(
                url, params=dict(params or {}), headers=dict(headers or {}), timeout=self.timeout
            )
        except requests.RequestException as exc:
            raise SourceError(f"GET {url} failed: {type(exc).__name__}: {exc}") from None
        return resp


@dataclass
class RecordedHttp:
    """Replays responses saved by :class:`RecordingHttp` from ``directory``."""

    directory: Path
    requests_made: list[str] = field(default_factory=list)

    def get_json(
        self, url: str, params: Params | None = None, headers: Params | None = None
    ) -> HttpResult:
        name = recording_name(url, params)
        path = self.directory / name
        self.requests_made.append(name)
        if not path.exists():
            raise RecordingMissingError(f"no recording {name}")
        data = json.loads(path.read_text(encoding="utf-8"))
        return HttpResult(int(data["status"]), dict(data.get("headers", {})), data["body"])


@dataclass
class RecordingHttp:
    """Passes requests to ``inner`` and saves every response under ``directory``."""

    inner: HttpClient
    directory: Path

    def get_json(
        self, url: str, params: Params | None = None, headers: Params | None = None
    ) -> HttpResult:
        result = self.inner.get_json(url, params, headers)
        self.directory.mkdir(parents=True, exist_ok=True)
        record = {
            "url": url,
            "params": public_params(params),
            "status": result.status,
            "headers": dict(result.headers),
            "body": result.body,
        }
        path = self.directory / recording_name(url, params)
        path.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        return result


def require_ok(result: HttpResult, what: str) -> Any:
    """The body of a 200 response, or a :class:`SourceError` naming the source."""
    if result.status != 200:
        detail = result.body if isinstance(result.body, str) else json.dumps(result.body)[:300]
        raise SourceError(f"{what}: HTTP {result.status}: {detail}")
    return result.body
