# .github/workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `main`, pull requests, manual | Pipeline ruff, mypy, pytest; `actionlint` on these workflows. App jobs come in Part 7 |
| `daily.yml` | cron + manual | Runs the pipeline against the live APIs and publishes to the `gh-pages` branch |

## `daily.yml` (Publish feed)

| Cron (UTC) | Job | Odds credits |
|---|---|---|
| `0 6 * * *` | `run-daily`: signals for the next 48 h, results, meta | 4 |
| `0 17 * * *` | `run-closing`: pre-kickoff odds snapshot (closing odds, FR-D10) | 4 |
| `20 */3 * * *` | `run-results`: results of the last 14 days | 0 |

Each run checks out `gh-pages` into `site/`, runs `betadvisor run-<job> --out site`, re-validates every
feed file (`betadvisor validate`), updates `feed/health.json` (`betadvisor heartbeat`), and only then
commits and pushes. Any failure stops before the push, so the published feed stays as it was (FR-D11).
One `concurrency` group serializes all runs. A failed run opens an issue labeled `pipeline-failure`, or
comments on the open one.

The `gh-pages` branch is the pipeline state, served by GitHub Pages:

```
feed/{signals,results,meta}.json   latest feed (the app reads these)
feed/health.json                   last success per job (schemas/health.schema.json)
archive/<date>/                    every signals version and run record, never rewritten
odds/<date>/                       odds snapshots used for closing odds
```

Manual runs: `gh workflow run daily.yml -f job=daily` (or `closing`, `results`). Add
`-f simulate_failure=true` to run with invalid keys: the run must fail, open or update the issue, and
publish nothing.

## One-time setup

```sh
gh auth login
gh repo create <name> --public --source . --push
git push origin gh-pages
gh secret set -f pipeline/.env      # ODDS_API_KEY, FOOTBALL_DATA_ORG_TOKEN, API_FOOTBALL_KEY
gh api -X POST "repos/{owner}/{repo}/pages" -f "source[branch]=gh-pages" -f "source[path]=/"
gh workflow run daily.yml -f job=daily
```

The feed is then at `https://<owner>.github.io/<repo>/feed/signals.json`.
