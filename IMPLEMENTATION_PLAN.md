# BetAdvisor Implementation Plan

**Source documents:** `PRD.md`, `SRS.md`, `design/` (split from `BetAdvisor app UI.html`; index in `design/README.md`)
**Target device:** Google Pixel 8, Android 17 (API 37), installed by sideloading
**Date:** 2026-11-09

---

## How to use this plan

- The work is split into **20 parts (0 to 19)**. Each part fits one Claude Code session with room to spare.
- Start each part in a **fresh session** with: `Do Part N of IMPLEMENTATION_PLAN.md`.
- Each part lists **Read** (the only files needed for context), **Build**, **Verify** (commands Claude runs and must pass), and **Done when**.
- Never read `BetAdvisor app UI.html`. Use `design/screens/NN-*.html` (3 to 7 KB each) and `design/shared/*`.
- At the end of every part Claude: (1) runs that part's Verify commands and shows the result, (2) ticks the part in the tracker below and adds a 1 to 3 line note (deviations, open issues), (3) proposes a git commit.
- Simulator/emulator and phone testing happen only in **Part 17**. Before that, all testing is automated (unit, component, integration, schema, CLI runs).
- Parts marked **[needs you]** require an action only you can take (an account, an API key, a USB cable).

### Progress tracker

| Part | Title | Status | Notes |
|---|---|---|---|
| 0 | Repo bootstrap and toolchain | [x] | Branch `main`. Package uses `src/` layout with a stub `betadvisor` Typer CLI and 1 smoke test. Added `make typecheck-pipeline` (mypy strict) and `make format-pipeline`. `make test-app` is a stub until Part 7. |
| 1 | Feed contract (JSON Schemas + sample feeds) | [x] | Strict schemas (no extra fields, UTC `Z` only). Added `league_code`, `versioned_at`; `supersedes` is `{version, versioned_at}` or null. `day1-normal` has 3 recommended bets, not 2, to match design 02's "3 bets · $5.03" header. `feed-samples/manifest.json` holds each scenario's `reference_now` and the expected failure path of each malformed file. |
| 2 | Pipeline: decision engine | [ ] | |
| 3 | Pipeline: historical data and Elo | [ ] | |
| 4 | Pipeline: Dixon-Coles model and backtest | [ ] | |
| 5 | Pipeline: live adapters and daily run [needs you] | [ ] | |
| 6 | Automation: GitHub Actions and Pages [needs you] | [ ] | |
| 7 | App: scaffold, theme, fonts, icons, test harness | [ ] | |
| 8 | App: domain logic (pure functions) | [ ] | |
| 9 | App: database and services | [ ] | |
| 10 | App: feed client and cache | [ ] | |
| 11 | App: component library | [ ] | |
| 12 | App: Setup, Today, Bet detail | [ ] | |
| 13 | App: Ledger, Sessions, Reset | [ ] | |
| 14 | App: Performance, More, Settings, About | [ ] | |
| 15 | App: background settlement and notifications | [ ] | |
| 16 | App: end-to-end integration against live feed | [ ] | |
| 17 | Emulator test and Pixel 8 install [needs you] | [ ] | |
| 18 | Model upgrade, M5 (optional) | [ ] | |
| 19 | Live paper trading, report and polish (M6, M7) | [ ] | |

Suggested order: 0 to 4 (pipeline core, no keys needed), then 7 to 11 (app core, mock data), then 5 and 6 (live data, needs keys), then 12 to 19. Parts 5 and 6 can be moved earlier once you have the keys.

---

## Environment check (done 2026-11-09)

| Tool | Found | Status |
|---|---|---|
| macOS | 27.2, Apple Silicon (arm64) | OK |
| Node / npm | v24.14.0 (nvm) / 11.11.0 | OK |
| JDK | Temurin 21.0.10 | OK for Gradle / Android Gradle Plugin |
| Android Studio | `/Applications/Android Studio.app` | OK |
| Android SDK | `~/Library/Android/sdk` (`ANDROID_HOME` set). Platforms 36, 36.1, 37.0. Build-tools 35 to 37. NDK 27.0, 27.1. CMake. cmdline-tools/latest | OK |
| Emulator AVDs | `tt_api37` (**Pixel 8 profile, Android 17, arm64**), `tt_api36` (Pixel 7), `tt_api26` (Pixel 2, Android 8.0) | OK. `tt_api37` matches your phone and `tt_api26` covers the SRS minimum (API 26). All have 2 GB RAM; raise to 4 GB in Part 17 if the emulator is slow |
| adb | `/opt/homebrew/bin/adb` (a second copy is in the SDK platform-tools) | OK. Part 17 uses the SDK copy to avoid version mismatch |
| Python | System 3.9.6 (too old); **`/opt/homebrew/bin/python3.11`** | Use 3.11 for the pipeline venv |
| watchman, brew, git, eas-cli | present | OK (EAS cloud is not needed; builds are local) |
| GitHub CLI `gh` | **missing** | Install in Part 6 (`brew install gh`) or create the repo in the browser |
| Git repository | **not initialized** | Part 0 |

Android 17 notes for the Pixel 8:
- **Install with `adb install`** over USB. Google's new developer-verification rules for sideloaded apps target installs from the device; adb installs from a computer remain allowed. If Android shows a verification prompt, Part 17 has a fallback.
- Edge-to-edge layout is enforced, so the app must handle system-bar insets (`react-native-safe-area-context`).
- Notifications need the runtime `POST_NOTIFICATIONS` permission. Exact alarms are not granted by default, so the daily reminder may arrive a few minutes late (acceptable for FR-N1).
- Background work runs through WorkManager (`expo-background-task`), with a 15-minute minimum interval. Android decides when it actually runs.

---

## Key technical decisions

These resolve the PRD open questions and SRS gaps. Change them here before the related part starts.

| Topic | Decision |
|---|---|
| Repo layout | Monorepo: `schemas/` (JSON Schemas), `feed-samples/`, `pipeline/` (Python), `app/` (Expo), `design/`, `docs/`, `.github/workflows/` |
| App stack | Latest stable Expo SDK (checked at Part 7), TypeScript strict, `expo-router` (tabs + stack), `expo-sqlite`, `zod`, `react-native-svg` (icons and chart), `@expo-google-fonts/barlow` + `barlow-condensed`, `@shopify/flash-list`, `expo-notifications`, `expo-background-task` + `expo-task-manager` (replaces the deprecated `expo-background-fetch` named in SRS 7.2), `expo-file-system` + `expo-sharing` (CSV) |
| Builds | Local only: `npx expo prebuild` + Gradle. Development build for the emulator, signed release APK for the phone. No Expo Go (background tasks need a dev build) |
| Money | Integer **cents** in the domain layer and the database (SRS 5.1 allows this). Columns are named `*_cents`. Odds and probabilities are REAL |
| Time | Stored as UTC ISO 8601. A "day" is the **device local calendar date** of kickoff. The daily cap uses the bankroll at the start of that local day: the last `bankroll_history` entry before local midnight, or the current bankroll if there is none that day |
| Bankroll model | `bankroll = starting_budget + Σ(bankroll_history deltas)`; freezing subtracts the stake and settling adds the payout (FR-R4). `bankroll_history` stores `delta_cents` and `bankroll_cents` so NFR-I2 can be checked |
| Immutability | SQLite `BEFORE UPDATE` trigger on `bets` that raises unless only `status`, `settled_at`, `payout_cents`, `profit_cents`, `closing_odds`, `review_flag` change; a `BEFORE DELETE` trigger blocks deletes (NFR-I1, FR-S4) |
| Day chips (Yesterday / Today / Tomorrow) | Yesterday is read-only (frozen bets and results). Today allows **Follow advice**. Tomorrow is a read-only preview (stakes are computed when that day starts) |
| Follow flow | "Follow advice" freezes every eligible recommended signal of today in one transaction (FR-B1). FR-B5 (choose a subset) is a toggle in Settings, default off, built in Part 14 |
| Market scope (PRD Q3) | 1X2 only in v1 |
| Minimum stake (PRD Q4) | $1.00 default, configurable |
| Sessions (PRD Q5) | Exactly one active session (FR-S2) |
| Feed hosting | GitHub Pages from a `gh-pages` branch: `https://<user>.github.io/<repo>/feed/{signals,results,meta}.json`. The base URL is set in `app.json` → `extra.feedBaseUrl` |
| Fixtures and results | football-data.org v4 free tier (competitions `PL`, `PD`, `BL1`, `FL1`; 10 requests/min) |
| Odds (PRD Q1) | The Odds API, `regions=eu&markets=h2h`, sports `soccer_epl`, `soccer_spain_la_liga`, `soccer_germany_bundesliga`, `soccer_france_ligue_one`. Morning run: 4 credits. Pre-kickoff run for closing odds: 4 credits. About 240 of the 500 free credits per month. Every response is cached on disk |
| History and backtest | football-data.co.uk season CSVs (E0, SP1, D1, F1), 10+ seasons, including bookmaker and closing odds |
| Injuries (PRD Q2) | Optional adapter for the API-Football free tier. If it is missing or fails, availability is `unknown`, the summary says so, and the signal gets the `low_data` quality flag. It is never silently treated as "no injuries" |
| Team identity | One `pipeline/data/teams.csv` mapping canonical team code to the names each source uses. Unknown names fail the run loudly (FR-D11) |
| Signal versioning (FR-D8) | `signal_id` = `{date}_{LEAGUE}_{HOME}-{AWAY}_1X2_{SEL}`. Each run writes `archive/{date}/signals-{HHMMSS}.json` and never edits older archive files. `feed/signals.json` holds the latest version, with `version` and `supersedes` fields. The app freezes whatever version it has at freeze time and never updates a frozen bet |
| Feed size | `signals.json` covers kickoffs from 24 h ago to +48 h. `results.json` covers the last 14 days. Both stay well under 500 KB (NFR-P2) |

---

## Part 0: Repo bootstrap and toolchain

**Read:** this plan (sections above only).
**Build:**
- `git init`, `.gitignore` (node, Python, Android, `.env`, `pipeline/.cache/`, `*.keystore`), `.editorconfig`.
- Folder skeleton from the Repo layout decision, with a placeholder README per folder.
- `CLAUDE.md`: a short project guide (layout, commands, conventions: cents, UTC, immutability, "read design/screens per screen, never the big HTML", "update the tracker after each part").
- `pipeline/`: venv with `/opt/homebrew/bin/python3.11 -m venv .venv`, `pyproject.toml` (package `betadvisor`, deps: pandas, numpy, scipy, requests, jsonschema, pydantic, typer; dev: pytest, pytest-cov, ruff, mypy).
- Root `Makefile` (or `justfile`): `make test-pipeline`, `make lint-pipeline`, later `make test-app`.
**Verify:** `pipeline/.venv/bin/python --version` → 3.11.x; `pipeline/.venv/bin/pytest` runs (0 tests is fine); `ruff check pipeline` passes; `git status` is clean after the first commit.
**Done when:** the first commit exists and the tracker is updated.

## Part 1: Feed contract (JSON Schemas + sample feeds)

**Read:** SRS §5.2, §9 (items 4, 5, 6), FR-D7, FR-D8, FR-A7, FR-A8; `design/screens/12-bet-detail-full-length.html` (only the fields shown).
**Build:**
- `schemas/signals.schema.json`, `results.schema.json`, `meta.schema.json` (Draft 2020-12). Extend SRS §5.2 with: `version`, `supersedes`, `home_code`, `away_code`, `quality_flags[]`, `skip_reason` enum (`no_edge`, `below_threshold`, `odds_out_of_range`, `missing_data`, `low_confidence`), `context.availability_status` (`reported` | `unknown`), `context.lineup_confirmed`. App-side reasons (`daily_cap`, `min_stake`, `kickoff_passed`) are not in the feed.
- `meta.schema.json`: `schema_version`, `generated_at`, `model_version`, `min_app_version`, `notice`, `sources_health{}`.
- `feed-samples/`: scenario sets used by both test suites, each with signals, results and meta: `day1-normal` (matches design 02: two recommended plus skips), `day1-results` (one win, one loss, one postponed), `no-signals`, `stale` (generated 26 h ago), `malformed` (several invalid files), `versioned` (the same signal_id with v1 and v2 and different odds).
- `schemas/README.md` documenting every field.
**Verify:** a small script `pipeline/tests/test_samples_valid.py` validates every good sample and expects every `malformed` file to fail. Run it with pytest.
**Done when:** schemas and samples are committed and the tests pass.

## Part 2: Pipeline, decision engine

**Read:** SRS §6.1 to 6.3, FR-D4 to FR-D6, §9 item 6; `schemas/signals.schema.json`.
**Build:** `pipeline/betadvisor/decision/`:
- `devig.py`: proportional method (SRS 6.1), with the Shin method behind a flag.
- `edge.py`: `edge = p × odds − 1`; Kelly `f* = (p × odds − 1) / (odds − 1)`; `stake_fraction = min(k × max(f*, 0), cap)`.
- `filters.py`: min edge 4%, odds 1.40 to 6.00, data quality (no model prob, unknown team, stale odds older than 12 h → `missing_data`; `low_data` flag → `low_confidence` when the edge is below 2× threshold), and at most one selection per match (highest edge).
- `select.py`: turns (match, model probs, odds) into the list of signal entries (recommended plus skipped with reason).
- `config.py`: thresholds in one dataclass, written into `meta.json`.
**Verify:** pytest with hand-computed cases: SRS example (p 0.52, odds 2.10 → edge 0.092, f* 0.0836, fraction 0.0209); boundary edge exactly 4%; odds 1.39 and 6.01 rejected; negative edge → `no_edge`; two positive selections on one match → only the larger edge is recommended; overround removed so implied probabilities sum to 1 ± 1e-9. `ruff` and `mypy` clean. Coverage of `decision/` ≥ 95%.
**Done when:** all tests pass.

## Part 3: Pipeline, historical data and Elo

**Read:** SRS §3.1 (ingest, features), §6.7; `pipeline/betadvisor/decision/config.py` (for conventions).
**Build:**
- `ingest/base.py`: adapter protocols (`FixtureSource`, `OddsSource`, `ResultSource`, `AvailabilitySource`, `HistorySource`) (NFR-M2).
- `ingest/football_data_couk.py`: downloads season CSVs for E0, SP1, D1, F1 (2014-15 to the current season) into `pipeline/.cache/history/`, then normalizes them to one parquet/CSV table: date, league, home, away, FTHG, FTAG, average and Pinnacle 1X2 odds, closing odds when present.
- `data/teams.csv` plus `teams.py` name normalization. Covers every team in the history files. Unknown names raise an error.
- `features/elo.py`: goal-difference-weighted Elo with home advantage and season-start regression to the mean. Computed strictly in date order, and the rating used for a match is the one **before** that match.
- `features/form.py` (last 5 results string, like "WWDWL") and `features/rest.py` (days since last match).
**Verify:** pytest uses a small committed CSV fixture (no network). Tests: Elo is zero-sum per match; ratings are unchanged by future matches (leakage test: truncate the data after date D and check that features for matches ≤ D are identical); form string order (newest on the right, as in design 12); team normalization fails on an unknown name. One real download run: `python -m betadvisor history fetch` prints row counts per league and season.
**Done when:** tests pass and the full history loads.

## Part 4: Pipeline, Dixon-Coles model and backtest

**Read:** SRS §6.7, FR-D12, AC-10; `features/elo.py` (interfaces only).
**Build:**
- `models/dixon_coles.py`: attack/defence/home parameters with the low-score correction (rho), time-decay weighting (xi), fitted per league by maximum likelihood (`scipy.optimize`). Outputs P(H/D/A) from the score matrix (0 to 10 goals).
- `models/elo_1x2.py`: maps Elo difference to 1X2 probabilities (ordered logit fitted on history).
- `models/blend.py`: weighted blend; the weight is chosen on the validation seasons only. `MODEL_VERSION = "dc-elo-0.1.0"`.
- `backtest/run.py`: walk-forward evaluation (refit per matchweek or monthly, train only on earlier data). Reports log loss and Brier score for the model, for the de-vigged market, and for the blend. Writes calibration bins and a plot (matplotlib PNG), and simulates a bankroll with the real decision engine (start 100, quarter Kelly, caps) on closing or average odds. Fixed seed. Outputs go to `docs/backtest/` (`report.md`, `calibration.png`, `bankroll.png`, `metrics.json`).
- CLI: `python -m betadvisor backtest --seasons 2022-23..2025-26`.
**Verify:** pytest: on synthetic data generated from known parameters, the Dixon-Coles fit recovers them within tolerance; probabilities sum to 1; the walk-forward splitter never puts a training date ≥ the test date; backtest smoke run on the fixture data. Then one real backtest run, with the headline numbers shown and recorded in the tracker notes. Expectation: model log loss slightly worse than the market. That is fine and is reported honestly.
**Done when:** `docs/backtest/report.md` exists with log loss, Brier score, calibration plot and simulated bankroll (AC-10).

## Part 5: Pipeline, live adapters and daily run [needs you]

**You provide (in `pipeline/.env`, gitignored):** `ODDS_API_KEY` (the-odds-api.com, free), `FOOTBALL_DATA_ORG_TOKEN` (football-data.org, free), optionally `API_FOOTBALL_KEY`.
**Read:** SRS FR-D1 to FR-D11, §5.2; `schemas/*.json`; `ingest/base.py`.
**Build:**
- `ingest/football_data_org.py`: fixtures for the next 48 h and results for the last 14 days, with statuses mapped to FINISHED / POSTPONED / CANCELLED / ABANDONED.
- `ingest/odds_api.py`: h2h odds per league with a disk cache keyed by date and league, and a quota guard that reads the `x-requests-remaining` header and stops below a reserve of 50. Odds are taken as the median across EU books, and `bookmaker` is the book whose price is closest to that median.
- `ingest/api_football.py` (optional): injuries and suspensions. Missing key → availability `unknown`.
- `publish/`: builds `signals.json`, `results.json` (with closing odds from the pre-kickoff snapshot when available, FR-D10) and `meta.json`. Validates all three against the schemas, writes the timestamped archive, never rewrites old archive files (FR-D8), and writes to `out/feed/` atomically. On any error it exits non-zero and leaves the previous files untouched (FR-D11).
- CLI: `betadvisor run-daily`, `betadvisor run-results`, `betadvisor run-closing`, each with `--dry-run` and `--offline` (offline = use recorded responses).
- Recorded API responses in `pipeline/tests/recordings/` for offline tests.
**Verify:** pytest (offline, recordings): end-to-end `run-daily --offline` produces schema-valid files; a second run with changed odds creates v2 with `supersedes` and leaves the v1 archive byte-identical; an unknown team name → exit code ≠ 0 and the previous output is unchanged; the quota guard stops when the remaining quota is low. Then **one live run** with your keys: show the number of fixtures, signals and recommended bets, and the credits used.
**Done when:** a live `out/feed/` is produced and valid.

## Part 6: Automation, GitHub Actions and Pages [needs you]

**You provide:** a GitHub repo (public is needed for free Pages; there are no secrets in the code), the repo secrets `ODDS_API_KEY`, `FOOTBALL_DATA_ORG_TOKEN`, (`API_FOOTBALL_KEY`). Install `gh` (`brew install gh` + `gh auth login`) or do it in the browser.
**Read:** SRS FR-D1, FR-D9, FR-D11, NFR-M3, NFR-C1; `pipeline/betadvisor/cli.py`.
**Build:**
- `.github/workflows/ci.yml`: on push, runs pipeline tests and ruff (app jobs are added in Part 7).
- `.github/workflows/daily.yml`: cron `0 6 * * *` (signals), `0 17 * * *` (closing odds), `0 */3 * * *` (results), plus `workflow_dispatch`. Each job checks out the `gh-pages` branch, runs the CLI, validates, then commits and pushes only if validation passed. The `concurrency` group prevents overlapping runs.
- Failure alert: a failing scheduled run opens (or comments on) a GitHub issue labeled `pipeline-failure`, in addition to GitHub's own failure email.
- A `feed/health.json` heartbeat with the last success per job.
**Verify:** `actionlint` (installed via brew) passes. A manual `gh workflow run daily.yml` succeeds, `curl` of the Pages URL returns valid JSON that passes schema validation locally, and a deliberately broken run (bad secret via `workflow_dispatch` input `simulate_failure`) fails and leaves the published feed unchanged.
**Done when:** the public feed URL serves valid data and is written into the tracker notes.

## Part 7: App, scaffold, theme, fonts, icons, test harness

**Read:** `design/README.md`, `design/shared/tokens.css`, the top of `design/shared/components.js` (the `ICONS` map only).
**Build:**
- `npx create-expo-app@latest app --template` (TypeScript, expo-router tabs). Record the Expo SDK and React Native versions in the tracker. Android only: `android.package = "dev.hamza.betadvisor"`, minSdk 26 (NFR-U1), `userInterfaceStyle: "automatic"`.
- Dependencies from the Key decisions table.
- `src/theme/tokens.ts`: a direct port of `tokens.css` (dark and light palettes, spacing, radius, sizes, type scale as RN text styles). `ThemeProvider` with system / dark / light modes.
- Fonts: Barlow 400/500/600/700 and Barlow Condensed 600/700, loaded before the splash screen hides.
- `src/ui/Icon.tsx`: the 23 Lucide paths from `components.js` rendered with `react-native-svg`.
- Tooling: ESLint (expo config), Prettier, `tsc --noEmit`, Jest (`jest-expo` preset) plus `@testing-library/react-native`, coverage thresholds configured (domain ≥ 90%).
- `app/src/` structure: `db/ domain/ api/ ui/ features/ background/ notifications/ config/` (SRS 3.2). Screens live under `app/app/` (expo-router).
- Add app jobs to `.github/workflows/ci.yml` (lint, tsc, jest).
**Verify:** `npm run lint`, `npx tsc --noEmit`, `npm test` (smoke test: renders a themed screen in dark and light; the Icon renders every name). `npx expo-doctor` reports no problems. `npx expo prebuild --platform android --clean` succeeds (no device needed).
**Done when:** all checks are green.

## Part 8: App, domain logic (pure functions)

**Read:** SRS §6.3 to 6.6, FR-A3 to FR-A6, FR-A10, FR-R2 to FR-R6, FR-P2 to FR-P6, §9, §10.2.
**Build:** `app/src/domain/` with no React and no I/O:
- `money.ts`: cents helpers (`Math.round` to whole cents, matching SRS `round(x, 2)`), locale formatting with the chosen currency symbol (NFR-U3).
- `stakes.ts`: `planDay(signals, bankrollAtDayStartCents, settings, now)` → `{ toFollow[], skipped[] }`. Applies fraction → cents, per-bet cap, daily cap in descending-edge order (FR-A5), minimum stake (FR-A6), and kickoff passed (FR-A10, with the clock-skew rule from §9.5). Bankroll depleted is reported when no stake can reach the minimum (§9.1).
- `settlement.ts`: `settle(bet, result)` → status, payout and profit for won / lost / void. `isReviewDue(bet, now)` (72 h, FR-R6).
- `metrics.ts`: ROI, hit rate, counts, average odds, average stake, max drawdown (amount and %, plus peak/trough indices for the chart band), profit by league and by market, CLV, bootstrap ROI interval (seeded PRNG, 2,000 resamples, 90% interval) (FR-P5).
- `session.ts`: budget validation (min 10, max 1,000,000, 2 decimals, FR-S1), reset plan (what gets archived, FR-S3 to FR-S6).
- `day.ts`: local-day bucketing and Yesterday / Today / Tomorrow selection.
**Verify:** Jest with AC-1, AC-2, AC-3, AC-7 as named tests, plus edge cases: rounding (fraction 0.0209 × $107.20 → $2.24, as in design 02), cap ordering, every stake below the minimum → depleted, void returns the stake, drawdown on a monotonic curve = 0, bootstrap deterministic with the same seed. Coverage of `domain/` ≥ 90% (NFR-M1), enforced by the Jest threshold.
**Done when:** tests and coverage pass.

## Part 9: App, database and services

**Read:** SRS §5.1, FR-S1 to FR-S7, FR-B1 to FR-B4, FR-R2 to FR-R5, NFR-R2, NFR-I1, NFR-I2; `app/src/domain/*.ts` (exports only).
**Build:**
- `db/driver.ts`: a minimal `SqlDriver` interface (`exec`, `run`, `get`, `all`, `transaction`). `db/expoDriver.ts` wraps `expo-sqlite`. `db/testDriver.ts` wraps `better-sqlite3` (dev dependency) so the real SQL runs in Jest.
- `db/migrations/001_init.ts`: the SRS schema with cents columns, `review_flag`, a `settings` table (key/value), the immutability and no-delete triggers, and indexes on `bets(session_id, kickoff_at)` and `bets(match_id)`. A `user_version`-based migration runner.
- Repositories: `sessionsRepo`, `betsRepo`, `bankrollRepo`, `cacheRepo`, `settingsRepo`.
- Services (each in one transaction): `createSession`, `resetSession` (closes the active session, stores `final_bankroll` and stats, creates the new one), `followAdvice(day)` (uses `planDay`; `UNIQUE(session_id, signal_id)` prevents doubles, FR-B4), `settleFromResults(results)` (idempotent, applies to open bets in **all** sessions so archived ones still settle (FR-S6) but writes bankroll history only to the bet's own session), `flagStaleBets`.
- `db/consistency.ts`: the NFR-I2 check (starting budget + Σ deltas == current bankroll), also callable in dev builds.
**Verify:** Jest with the better-sqlite3 driver: AC-4 (reset to $300 → new active session at $300.00, old session listed), AC-5 (re-processing results leaves the bankroll unchanged), AC-6 (a newer signal version does not change frozen fields), an UPDATE of `odds` on a bet throws (trigger), DELETE throws, a crash mid-transaction rolls back (simulated throw), an archived open bet settles without touching the new session, and the consistency check holds after a random sequence of 200 operations (seeded property test).
**Done when:** tests pass.

## Part 10: App, feed client and cache

**Read:** SRS FR-A1, FR-A9, FR-R1, NFR-R1, NFR-S3, §7.3, §9.5; `schemas/*.json`; `feed-samples/` (file names only).
**Build:**
- `api/schemas.ts`: zod schemas mirroring the JSON Schemas. A test ensures that every `feed-samples` file parses identically in zod and in the JSON Schema (Ajv, dev dependency), so the two cannot drift.
- `api/feedClient.ts`: GET with `If-None-Match` / ETag, a 10 s timeout, schema validation, and a write to the `cache` table only after validation passes. Malformed data is rejected and the last good cache is kept. A `min_app_version` check shows an "update required" notice.
- `api/feedStore.ts`: a small state store (React context or zustand) exposing `signals`, `results`, `meta`, `lastFetchedAt`, `generatedAt`, `isStale` (>24 h, FR-A9), `isOffline`, `refresh()`.
- `config/feed.ts`: base URL from `expo-constants` extra. In dev builds it can point to `feed-samples/` served locally.
**Verify:** Jest with mocked `fetch`: 200 → cached; 304 → cache reused; malformed → rejected and the old cache kept; network error → offline flag set and cache served (AC-8); a 26 h old `generated_at` → `isStale`; device clock skew > 10 min → the kickoff check uses feed time (§9.5).
**Done when:** tests pass.

## Part 11: App, component library

**Read:** `design/shared/components.js` (full), `design/shared/components.css`, `design/README.md`.
**Build:** RN ports in `app/src/ui/` of all 19 components with the same names and props: Button, Chip, StatusPill, EdgeBadge, TeamBadge, FormStrip, ProbabilityBar, SignalCard, SkipRow, LedgerRow, StatTile, BankrollHero, BankrollChart (react-native-svg: line, dashed start line, drawdown band, start/end labels), Banner, TabBar (used as the custom expo-router tab bar), AppBar, SessionCard, BudgetInput, plus a `BottomSheet` (RN `Modal` + animated slide, needed by design 05). Requirements: minimum tap target 48 dp, `accessibilityRole` and `accessibilityLabel` on everything interactive, won/lost shown by color **plus icon and text** (SRS 7.1), Dynamic Type via `allowFontScaling` with a max multiplier.
- `app/app/dev/gallery.tsx` (dev builds only): renders every component in all states and both themes, for the emulator check in Part 17.
**Verify:** RNTL tests per component: renders, props reflected in text, press handlers fire, accessibility labels exist, StatusPill shows a distinct icon per status, BankrollChart handles 0, 1 and 500 points. Snapshot tests for dark and light. Lint and tsc clean.
**Done when:** tests pass.

## Part 12: App, Setup, Today, Bet detail

**Read (one at a time, as each screen is built):** `design/screens/01`, `08`, `02`, `03`, `09`, `10`, `11`, `12`; SRS FR-A1 to FR-A10, FR-B1, §9.1, NFR-U2.
**Build:**
- Routing: the root layout decides between first launch (no active session, disclaimer not accepted) → Setup, and otherwise the tabs (Today, Ledger, Performance, Sessions, More). Bet detail is a stack route `/signal/[id]`.
- Setup (01, 08): budget input with presets 50/100/300/1000, validation errors, a disclaimer checkbox that gates the button, then `createSession`.
- Today (02, 03, 09, 10, 11): BankrollHero, day chips, Recommended header ("N bets · X% of bankroll", "N bets · $Y total stake"), SignalCards (frozen state with a lock after following), a Follow advice button (disabled when the data is stale > 24 h or the kickoff has passed; a confirm toast after), the Skipped list with reasons from the feed and the app, a footer "Updated HH:MM · model vX", pull to refresh, stale banner (09), no-signals empty state (10), and bankroll-depleted banner with a Reset action (11).
- Bet detail (12): teams, pick, ProbabilityBar model vs bookmaker with the edge formula worked out in text, FormStrips, availability (or "Unknown, source unavailable"), lineup status, "Why this pick", and the lock note.
**Verify:** RNTL integration tests with the in-memory DB and the `feed-samples` scenarios: first launch → Setup, invalid budget shows the error from design 08, start → Today shows 2 recommended with stakes $1.12 and $2.24 for a $107.20 bankroll (design 02 numbers), Follow advice → cards frozen and the bankroll reduced, follow twice → no duplicates, stale sample → banner and disabled follow, no-signals sample → empty state, depleted session → banner. Lint and tsc clean.
**Done when:** tests pass.

## Part 13: App, Ledger, Sessions, Reset

**Read:** `design/screens/13`, `04`, `05`; SRS FR-L1 to FR-L3, FR-S3 to FR-S7, NFR-P3.
**Build:**
- Ledger (13): FlashList grouped by day ("Today · Mon 9 Nov"), status chips with counts (All, Open, Won, Lost, Void), a league filter, a date filter (simple range sheet), LedgerRow with profit and bankroll after the bet, "34 bets, newest first", Export CSV (`expo-file-system` + `expo-sharing`; RFC 4180 quoting; all bet columns).
- Sessions (04): SessionCards for active and closed sessions (start/end dates, budget, final bankroll, ROI, bets), "View session N performance", a Reset button, and the note about archiving.
- Reset sheet (05): current bankroll, open-bet count with the "archived and still settled" note, a new budget input, "Archive and start new", and Cancel (FR-S5).
**Verify:** RNTL: filters combine correctly; CSV output matches a golden file (including names with commas and quotes); reset flow → old session closed with its stats, new session active, open bets still listed under the old session; a ledger of 1,000 generated bets renders and scrolls in the test renderer without errors (real smoothness is checked in Part 17).
**Done when:** tests pass.

## Part 14: App, Performance, More, Settings, About

**Read:** `design/screens/14`, `06`, `07`, `15`; SRS FR-P1 to FR-P7, §7.1 (Settings, About), NFR-L1 to NFR-L3.
**Build:**
- Performance (14): session switcher chips (active and past sessions, FR-P7), BankrollChart with a dashed start line and a drawdown band, a StatTile grid (bankroll, P/L, ROI, hit rate, bets, average odds, average stake, max drawdown, average CLV when available), the ROI range line ("ROI +9.7% (range −14% to +34%) over 31 settled bets"), profit by league with arrows, by market, and the small-sample warning.
- More (06): links to Settings and About, plus the version line.
- Settings (07): per-bet cap, daily cap, minimum stake (each applies from the next day, as the design note says; saved into the active session's `settings_json` with an effective date), the "choose bets individually" toggle (FR-B5), daily notification on/off and time, currency symbol, theme (Dark / Light / Match system), and Refresh data with the last-updated time.
- About (15): the three "How advice is made" steps with the **current** thresholds, data sources (the injuries source filled in from Part 5's decision), odds note, responsible gambling, versions (app, model, feed schema), and the disclaimer.
**Verify:** RNTL: metrics shown match `domain/metrics` for a fixture ledger; switching sessions changes the numbers; changing caps does not change already frozen bets (AC-6 again through the UI); the theme switch updates tokens; About shows no external bookmaker links (an automated test scans all screen text for URLs, which must be only the data-source hosts, NFR-L2).
**Done when:** tests pass.

## Part 15: App, background settlement and notifications

**Read:** SRS FR-N1, FR-N2, FR-R1, FR-R6; `app/src/api/feedClient.ts` and `db/services` (exports only).
**Build:**
- `background/task.ts`: an `expo-background-task` task (minimum interval 15 min; Android decides when it actually runs) that fetches results, calls `settleFromResults`, and flags stale bets. Registered on app start. Settlement also runs on app open and on pull to refresh (FR-R1).
- `notifications/`: requests permission (Android 13+ `POST_NOTIFICATIONS`) only when the user turns on the reminder, creates an Android channel, schedules a daily local notification at the chosen time ("New advice is ready"), and reschedules when the time changes. A notification tap opens Today.
- An app-state listener: refreshes the feed when the app returns to the foreground and the cache is older than 1 h.
- FR-R6 UI: bets older than 72 h after kickoff show a "Needs review" pill in the Ledger.
**Verify:** Jest with mocked expo modules: the task body settles bets and is idempotent; scheduling uses the right trigger and cancels the old one; permission denied → the toggle reverts with an explanation. `npx expo prebuild` then check the merged `AndroidManifest.xml` for `POST_NOTIFICATIONS`, the WorkManager receiver, and no unnecessary permissions (no location, no contacts).
**Done when:** tests pass and the manifest is verified.

## Part 16: App, end-to-end integration against the live feed

**Read:** SRS §10; the tracker notes (the feed URL from Part 6).
**Build:**
- Point the production config at the GitHub Pages feed URL.
- `app/scripts/verify-live-feed.ts`: fetches the live feed and validates it with the app's own zod schemas (it catches contract drift between pipeline and app).
- A multi-day integration test (Jest + in-memory DB + mocked clock) over the `feed-samples` sequence: day 1 follow → results arrive → settle → day 2 follow with the new bankroll → reset → old open bet settles into the archived session. Bankroll is checked at every step against hand-computed values. The NFR-I2 consistency check runs after every step.
- A `make check` target that runs everything (pipeline tests, app lint, tsc, jest, live feed verification).
**Verify:** `make check` passes. The live feed passes the app schema check.
**Done when:** everything is green and the app is ready for a device.

## Part 17: Emulator test and Pixel 8 install [needs you]

**Read:** the tracker notes; `design/README.md` (screen list).
**Steps:**
1. **Emulator (Android 17, Pixel 8 profile):** `emulator -avd tt_api37 -memory 4096 &`, wait for `adb wait-for-device` and `sys.boot_completed`, then `npx expo run:android` (development build).
2. Walk every screen in dark and light theme and take screenshots with `adb exec-out screencap -p > docs/screens/<name>.png`. Compare each one with the matching `design/screens/*.html` by reading both. Fix layout differences (spacing, fonts, colors, insets under edge-to-edge).
3. Scenario on the emulator: set up $100 → follow → change the emulator date or use a dev menu "simulate results" action (dev builds only) → settlement → reset to $300 → check the session archive. Then: airplane mode → cached data and stale warning (AC-8). Then: grant the notification permission and trigger a test notification. Then: `adb shell cmd jobscheduler run -f dev.hamza.betadvisor <id>` to force the background task.
4. **Minimum Android version check:** install the same build on `tt_api26` (Android 8.0) and run a smoke test of Setup and Today.
5. **Release build:** generate an upload keystore (stored outside the repo; you keep the password), configure signing, then `cd app/android && ./gradlew assembleRelease`. Check APK size and that no secrets are inside it (`unzip -p ... | strings | grep -i key`), NFR-S2.
6. **Pixel 8:** you enable Developer options → USB debugging and connect the cable. `adb devices` shows the phone, then `adb install -r app-release.apk`. Launch, run the smoke test, and check the notification permission flow on real Android 17. If Android 17 shows a developer-verification prompt for the sideloaded app, use the documented adb path or the "install anyway" option; Part 17 notes record what happened.
7. Leave the app running with a real session. This starts the 30-day period (Part 19).
**Done when:** all screens match the design, the scenario passes on the emulator, and the release APK runs on your Pixel 8.

## Part 18: Model upgrade, M5 (optional)

**Read:** `docs/backtest/report.md`; `pipeline/betadvisor/models/` (interfaces only).
**Build:** extra features (xG from a source whose terms allow it, otherwise shots on target from football-data.co.uk; the availability adjustment as a rating penalty per missing key player), a gradient-boosted model (LightGBM or sklearn HistGradientBoosting) on the 1X2 target, isotonic or Platt calibration on a held-out time slice, and a model version bump (`gb-cal-0.2.0`). The new model ships only if its backtest log loss beats `dc-elo-0.1.0` on the same walk-forward split; otherwise the result is documented and the old model stays.
**Verify:** the same backtest harness, with both models compared side by side in `docs/backtest/report.md`, and the leakage tests extended to the new features.

## Part 19: Live paper trading, report and polish (M6, M7)

**Read:** the tracker notes; `docs/backtest/report.md`.
**Build:**
- `pipeline/betadvisor/report/live.py`: reads the archived signals and results from `gh-pages` and builds `docs/live-report.md` (30+ days: bets, ROI with a bootstrap interval, CLV, calibration of live predictions, pipeline uptime from `health.json`, AC-9).
- README (overview, architecture diagram as Mermaid, screenshots, how to build, disclaimer, results with honest uncertainty), `docs/architecture.md`, and a demo video checklist.
- Final pass: SRS traceability table with every requirement marked done / partial / deferred, with a link to the test that covers it.
**Verify:** the report is generated from real data, and the traceability table has no unexplained gaps.

---

## Requirement coverage map

| Area | Parts |
|---|---|
| FR-S1 to FR-S7 (sessions) | 8, 9, 12, 13 |
| FR-A1 to FR-A10 (advice) | 8, 10, 12 |
| FR-B1 to FR-B5 (freezing) | 9, 12, 14 |
| FR-R1 to FR-R6 (settlement) | 8, 9, 15 |
| FR-P1 to FR-P7 (performance) | 8, 14 |
| FR-L1 to FR-L3 (ledger) | 13 |
| FR-N1, FR-N2 | 15 |
| FR-D1 to FR-D12 (pipeline) | 2 to 6 |
| NFR performance, integrity, offline | 9, 10, 13, 17 |
| NFR security, legal | 10, 14, 17 |
| AC-1 to AC-10 | 8 (1, 2, 3, 7), 9 (4, 5, 6), 10 (8), 6 and 19 (9), 4 (10) |

## Accounts and inputs you will need

| When | What |
|---|---|
| Part 5 | The Odds API key; football-data.org token; optional API-Football key |
| Part 6 | GitHub account and a public repo; repo secrets; `gh` installed and logged in (or use the browser) |
| Part 17 | Pixel 8 with USB debugging on, and a USB-C cable; a keystore password you choose |
