# BetAdvisor

Android app (Expo) that turns a daily football signal feed into paper bets, plus the Python pipeline that produces that feed. Specs: `PRD.md`, `SRS.md`. Build plan and progress tracker: `IMPLEMENTATION_PLAN.md`.

## Working on a part

- Sessions are started with `Do Part N of IMPLEMENTATION_PLAN.md`. Read only the files that part lists under **Read**.
- At the end of each part: run its **Verify** commands and show the output, tick the part in the tracker with a 1 to 3 line note, propose a git commit.
- Emulator / phone testing happens only in Part 17. Before that, everything is tested automatically.

## Layout

| Path | Contents |
|---|---|
| `schemas/` | JSON Schemas (Draft 2020-12) for `signals.json`, `results.json`, `meta.json` |
| `feed-samples/` | Scenario feed sets shared by the pipeline and app tests |
| `pipeline/` | Python 3.11 package `betadvisor` (`src/` layout, venv in `pipeline/.venv`) |
| `app/` | Expo / React Native app, TypeScript strict |
| `design/` | UI design, split per screen (index: `design/README.md`) |
| `docs/` | Reports and notes |
| `.github/workflows/` | Daily pipeline run, GitHub Pages publishing |

## Commands

- `make setup-pipeline`: create the venv with `/opt/homebrew/bin/python3.11` (system python is 3.9, do not use it) and install `pipeline[dev]`.
- `make test-pipeline`, `make lint-pipeline`, `make typecheck-pipeline`, `make format-pipeline`.
- `make lint-workflows`: actionlint on `.github/workflows/` (`brew install actionlint`).
- `make setup-app | test-app | lint-app | typecheck-app` (or `npm test`, `npm run lint`, `npm run typecheck` in `app/`). Add Expo packages with `npx expo install`. `npm run prebuild:android` regenerates `app/android/` (git-ignored).
- `make check`: everything (pipeline lint, mypy, pytest; app lint, tsc, jest; `npm run verify:feed`, which validates the live GitHub Pages feed with the app schemas).
- Pipeline runs: `betadvisor run-daily | run-results | run-closing` (keys in `pipeline/.env`, output in `out/`; see `pipeline/README.md`).

## Conventions

- **Design:** never read `BetAdvisor app UI.html` (3.6 MB). Read `design/screens/NN-*.html` for the screen at hand plus `design/shared/*`.
- **Money:** integer cents in the domain layer and database; columns are named `*_cents`. Odds and probabilities are floats.
- **Time:** store UTC ISO 8601. A "day" is the device local calendar date of kickoff.
- **Immutability:** frozen bets are never edited or deleted (SQLite triggers enforce it); only settlement fields may change. Pipeline archive files are never rewritten; new signal versions supersede old ones.
- **Feed failures are loud:** unknown team names or missing data fail the run or set quality flags; never silently assume defaults (e.g. missing injuries are `unknown`, not "none").
- **Secrets:** API keys live in `.env` (git-ignored) locally and in GitHub Actions secrets.
- Python: ruff (line length 100) and mypy strict must pass.
