# pipeline

Python 3.11 package `betadvisor`: data adapters, Elo / Dixon-Coles models, decision engine, feed writer.

```sh
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
```

Or from the repo root: `make setup-pipeline`, `make test-pipeline`, `make lint-pipeline`.

## Daily runs

Keys go in `pipeline/.env` (see `.env.example`). Output goes to `out/` (git-ignored): `feed/` (published),
`archive/` (every signals version plus a run record, never rewritten) and `odds/` (snapshots for closing odds).

```sh
.venv/bin/betadvisor run-daily     # fixtures + odds + model -> signals, results, meta (4 odds credits)
.venv/bin/betadvisor run-closing   # pre-kickoff odds snapshot (4 credits)
.venv/bin/betadvisor run-results   # results of the last 14 days with closing odds
```

Each command takes `--dry-run` (validate, write nothing), `--offline` (replay `tests/recordings/live`),
`--record DIR` (save live responses) and `--now` (pretend clock). Any source or validation error exits
non-zero and leaves the published files untouched.
