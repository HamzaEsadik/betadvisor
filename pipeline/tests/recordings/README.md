# Recorded API responses

`live/` holds one JSON file per request (`url`, `params`, `status`, kept `headers`, `body`), named by
`betadvisor.ingest.http.recording_name` (secrets such as `apiKey` are never part of a name or file).
`--offline` replays them; `tests/test_run_live.py` uses them with the simulated history from
`tests/live_fixture.py` and the clock `2026-11-09T06:00:00Z`.

The current files are hand-made in each provider's documented response format (football-data.org v4,
The Odds API v4, API-Football v3), with odds set so the scenario covers one recommended bet and each
kind of skip. To capture real responses, run a live command with `--record DIR`, e.g.
`betadvisor run-daily --record tests/recordings/real-YYYYMMDD`.
