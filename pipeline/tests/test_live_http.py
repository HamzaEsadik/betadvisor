"""LiveHttp rate-limit handling, with a fake session (no network)."""

from __future__ import annotations

import json
from typing import Any

import requests

from betadvisor.ingest.http import MAX_RETRY_WAIT_S, LiveHttp, retry_after_seconds


def _resp(status: int, body: Any, headers: dict[str, str] | None = None) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    resp._content = json.dumps(body).encode()
    resp.headers.update(headers or {})
    return resp


class FakeSession:
    def __init__(self, responses: list[requests.Response]) -> None:
        self.responses = responses
        self.calls = 0

    def get(self, url: str, **_: Any) -> requests.Response:
        self.calls += 1
        return self.responses.pop(0)


LIMITED = {"message": "You reached your request limit. Wait 5 seconds.", "errorCode": 429}


def test_429_is_retried_after_the_requested_wait() -> None:
    session = FakeSession([_resp(429, LIMITED), _resp(200, {"ok": True})])
    waits: list[float] = []
    http = LiveHttp(session=session, sleep=waits.append)  # type: ignore[arg-type]
    result = http.get_json("https://example.test/x")
    assert result.status == 200 and result.body == {"ok": True}
    assert waits == [6.0]
    assert session.calls == 2


def test_persistent_429_is_returned_after_bounded_retries() -> None:
    session = FakeSession([_resp(429, LIMITED) for _ in range(3)])
    waits: list[float] = []
    http = LiveHttp(session=session, sleep=waits.append)  # type: ignore[arg-type]
    result = http.get_json("https://example.test/x")
    assert result.status == 429
    assert session.calls == 3 and len(waits) == 2


def test_retry_wait_sources_and_cap() -> None:
    assert retry_after_seconds(_resp(429, {}, {"Retry-After": "3"})) == 4.0
    assert retry_after_seconds(_resp(429, {}, {"X-RequestCounter-Reset": "12"})) == 13.0
    assert retry_after_seconds(_resp(429, {}, {"Retry-After": "600"})) == MAX_RETRY_WAIT_S
    assert retry_after_seconds(_resp(429, "slow down")) == MAX_RETRY_WAIT_S
