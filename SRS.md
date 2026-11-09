# Software Requirements Specification (SRS)

**Product (working title):** BetAdvisor
**Document version:** 1.0
**Date:** 2026-11-09
**Status:** Draft
**Related document:** PRD.md

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements, architecture, data model, and interfaces of BetAdvisor, a free Android app that gives daily simulated football betting advice with bankroll management.

### 1.2 Scope
The system has two parts:
1. **Pipeline:** a scheduled Python job that produces daily betting signals and match results as static JSON.
2. **Mobile app:** a React Native (Expo) Android app that turns signals into stakes using a user-defined virtual bankroll, records bets locally, settles them, and reports performance.

No real money is handled. No user accounts or server-side user data exist.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Signal | A recommended bet published by the pipeline: match, market, selection, odds, model probability, edge, suggested stake fraction |
| Edge | `p_model × odds − 1` |
| Kelly fraction | Optimal stake fraction `f* = (p × odds − 1) / (odds − 1)` |
| Bankroll | The current virtual balance of a session |
| Session | A starting budget, start date, and its ledger of bets |
| Freeze | Saving a recommendation locally with its odds, probability and stake so it can never change |
| Settle | Marking a bet as won, lost or void and updating the bankroll |
| CLV | Closing line value: comparison between taken odds and final pre-kickoff odds |
| Overround | The bookmaker margin included in implied probabilities |

### 1.4 References
- PRD.md
- football-data.co.uk (historical results and odds)
- The Odds API (live odds)
- Expo and React Native documentation

---

## 2. Overall Description

### 2.1 Product perspective
A serverless, local-first system. All computation of probabilities happens in the pipeline. All money logic (stakes in dollars, bankroll, resets) happens on the device.

```
 Data sources (odds API, results, stats, injuries)
              |
              v
 GitHub Actions cron  -->  Python pipeline (model + decision)
              |
              v
 signals.json / results.json / meta.json  (GitHub Pages or Supabase free tier)
              |
              v
 Expo Android app  -->  expo-sqlite (sessions, bets, bankroll history)
```

### 2.2 User classes
- **End user:** installs the APK, sets a budget, follows daily advice.
- **Owner/maintainer:** operates the pipeline and reviews its health.

### 2.3 Operating environment
- App: Android 8.0 (API 26) or newer, Expo SDK current stable, TypeScript.
- Pipeline: Python 3.11+, run on GitHub Actions (ubuntu runner).
- Storage: SQLite on device, static JSON in the cloud.

### 2.4 Design constraints
- All services must be on free tiers.
- No backend with per-user state.
- Odds API calls are limited (about 500 credits per month on the free tier).
- Frozen recommendations are immutable.

### 2.5 Assumptions and dependencies
- Free odds and fixture data remain available.
- The user's phone has internet access at least once per day to fetch signals.
- Match results are available from a free source within a few hours of full time.

---

## 3. System Architecture

### 3.1 Pipeline modules

| Module | Responsibility |
|---|---|
| `ingest/` | Adapters per source: fixtures, odds, results, team stats, injuries, lineups |
| `features/` | Elo, form, xG-based features, rest days, home/away splits, availability impact |
| `models/` | Baseline Elo and Dixon-Coles Poisson, then gradient boosting with probability calibration |
| `decision/` | Odds de-vigging, edge calculation, Kelly fraction, filters and caps |
| `publish/` | JSON generation, schema validation, upload |
| `backtest/` | Time-split evaluation, calibration plots, simulated bankroll |

### 3.2 App modules

| Module | Responsibility |
|---|---|
| `db/` | SQLite schema, migrations, repositories |
| `domain/` | Session, bankroll, stake, settlement logic (pure functions, unit tested) |
| `api/` | Fetch and cache JSON feeds, version checks |
| `screens/` | Setup, Today, Ledger, Performance, Sessions, About |
| `notifications/` | Local scheduled reminders |
| `background/` | Periodic fetch and settlement |

---

## 4. Functional Requirements

Priority: **M** = must, **S** = should, **C** = could.

### 4.1 Session and budget management

| ID | Requirement | Pri |
|---|---|---|
| FR-S1 | The app shall allow the user to create a session by entering a starting budget greater than zero (min 10, max 1,000,000, two decimals). | M |
| FR-S2 | The app shall keep exactly one active session at a time. | M |
| FR-S3 | The app shall allow the user to reset the budget to a new amount, which closes the active session, stores its final statistics, and starts a new active session with the new budget. | M |
| FR-S4 | A reset shall never delete bets or history of previous sessions. | M |
| FR-S5 | The app shall ask for confirmation before a reset and show the current bankroll and open bets that will be closed. | M |
| FR-S6 | Open bets at reset time shall remain in the archived session and still be settled for record purposes, without affecting the new session. | S |
| FR-S7 | The app shall list past sessions with start date, end date, starting budget, final bankroll, ROI, and number of bets. | S |

### 4.2 Daily advice

| ID | Requirement | Pri |
|---|---|---|
| FR-A1 | The app shall fetch `signals.json` on open and when the user pulls to refresh, and cache the last successful response. | M |
| FR-A2 | The Today screen shall list recommended bets for the current day, each with match, league, kickoff time, market, selection, odds, stake in dollars, edge, model probability and bookmaker implied probability. | M |
| FR-A3 | The stake in dollars shall be computed on the device as `round(bankroll × stake_fraction, 2)`, then capped and floored per FR-A4 to FR-A6. | M |
| FR-A4 | A single stake shall not exceed the maximum per-bet cap (default 5% of current bankroll). | M |
| FR-A5 | Total stakes for one day shall not exceed the daily exposure cap (default 15% of bankroll at start of day). Bets are included in descending edge order until the cap is reached; the remaining signals are shown as skipped with the reason "daily cap reached". | M |
| FR-A6 | Stakes below the minimum stake (default $1) shall be skipped with the reason "stake below minimum". | M |
| FR-A7 | The Today screen shall show skipped matches with a reason: no edge, below threshold, missing data, cap reached, minimum stake. | S |
| FR-A8 | Each recommendation shall have a detail view with team form, key injuries and suspensions, expected lineup status, and a short plain-language explanation. | S |
| FR-A9 | The app shall show the time the data was last generated and warn if it is older than 24 hours. | M |
| FR-A10 | The app shall not allow accepting a recommendation for a match whose kickoff time has passed. | M |

### 4.3 Bet recording (freezing)

| ID | Requirement | Pri |
|---|---|---|
| FR-B1 | When the user opens a day's advice for the first time in an active session (or taps "Follow advice"), the app shall freeze the eligible recommendations as bets in the local database. | M |
| FR-B2 | A frozen bet shall store signal id, odds, model probability, edge, stake fraction, stake amount, bankroll at creation, and creation timestamp. | M |
| FR-B3 | A frozen bet shall be immutable except for its settlement fields. | M |
| FR-B4 | The same signal shall not be frozen twice in one session. | M |
| FR-B5 | The user may choose to follow only some recommendations (configurable: follow all by default). | C |

### 4.4 Settlement

| ID | Requirement | Pri |
|---|---|---|
| FR-R1 | The app shall fetch `results.json` on open and by periodic background fetch. | M |
| FR-R2 | For each open bet with a final result, the app shall set status to won, lost or void. | M |
| FR-R3 | Payout for a won bet shall be `stake × odds`; profit is `stake × (odds − 1)`. A lost bet returns zero. A void bet (postponed, abandoned) returns the stake. | M |
| FR-R4 | Bankroll shall be updated at the moment of freezing (stake reserved) and at settlement (payout added). | M |
| FR-R5 | Settlement shall be idempotent: processing the same result twice shall not change the bankroll twice. | M |
| FR-R6 | Bets still unsettled 72 hours after kickoff shall be flagged for review. | S |

### 4.5 Performance and analytics

| ID | Requirement | Pri |
|---|---|---|
| FR-P1 | The Performance screen shall show a bankroll curve over time for the active session. | M |
| FR-P2 | The screen shall show: current bankroll, profit/loss, ROI (`profit / total staked`), hit rate, number of bets, average odds, average stake. | M |
| FR-P3 | The screen shall show maximum drawdown. | S |
| FR-P4 | The screen shall show profit by league and by market. | S |
| FR-P5 | The screen shall show an uncertainty indicator for ROI (for example a bootstrap interval) and a note that small samples are unreliable. | C |
| FR-P6 | The app shall show average closing line value when closing odds are available. | C |
| FR-P7 | The user shall be able to view the same metrics for any past session. | S |

### 4.6 Ledger

| ID | Requirement | Pri |
|---|---|---|
| FR-L1 | The Ledger screen shall list all bets of the selected session, newest first, with status, stake, odds, result, profit and bankroll after the bet. | M |
| FR-L2 | The user shall be able to filter by status, league, and date. | S |
| FR-L3 | The user shall be able to export the session ledger as CSV. | C |

### 4.7 Notifications and background work

| ID | Requirement | Pri |
|---|---|---|
| FR-N1 | The app shall schedule an optional local daily notification at a user-chosen time. | C |
| FR-N2 | The app shall run a periodic background task (system permitting) to refresh results and settle bets. | S |

### 4.8 Pipeline

| ID | Requirement | Pri |
|---|---|---|
| FR-D1 | The pipeline shall run on a daily schedule and be triggerable manually. | M |
| FR-D2 | The pipeline shall fetch upcoming fixtures and odds for the four leagues for the next 24 to 48 hours. | M |
| FR-D3 | The pipeline shall compute outcome probabilities per match using the current model version. | M |
| FR-D4 | The pipeline shall remove the bookmaker margin to obtain implied probabilities and compute edge per outcome. | M |
| FR-D5 | The pipeline shall mark a signal as recommended only if edge is at least the minimum edge (default 4%), odds are within allowed range (default 1.40 to 6.00), and data quality checks pass. | M |
| FR-D6 | The pipeline shall output the suggested stake fraction as `fractional_kelly × f*` (default multiplier 0.25), capped at the per-bet cap. | M |
| FR-D7 | The pipeline shall publish `signals.json`, `results.json`, and `meta.json` validated against JSON schemas. | M |
| FR-D8 | The pipeline shall never overwrite a previously published signal for the same match and date; changes shall be written as new versions with a timestamp. | M |
| FR-D9 | The pipeline shall fetch final results and publish them within 6 hours of full time. | S |
| FR-D10 | The pipeline shall record pre-kickoff closing odds when available to enable CLV. | C |
| FR-D11 | The pipeline shall fail loudly (non-zero exit, notification to the owner) on source or validation errors and keep the last valid published files. | M |
| FR-D12 | The pipeline shall include a backtest command that evaluates the model on a strict time-based split and outputs log loss, Brier score, calibration data, and a simulated bankroll. | M |

---

## 5. Data Requirements

### 5.1 Local database schema (SQLite)

```sql
CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  starting_budget REAL    NOT NULL CHECK (starting_budget > 0),
  started_at      TEXT    NOT NULL,           -- ISO 8601 UTC
  ended_at        TEXT,                       -- NULL while active
  final_bankroll  REAL,                       -- set when closed
  status          TEXT    NOT NULL CHECK (status IN ('active','closed')),
  settings_json   TEXT    NOT NULL            -- caps, thresholds used by this session
);

CREATE TABLE bets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL REFERENCES sessions(id),
  signal_id        TEXT    NOT NULL,
  match_id         TEXT    NOT NULL,
  league           TEXT    NOT NULL,
  home_team        TEXT    NOT NULL,
  away_team        TEXT    NOT NULL,
  kickoff_at       TEXT    NOT NULL,
  market           TEXT    NOT NULL,          -- '1X2'
  selection        TEXT    NOT NULL,          -- 'HOME' | 'DRAW' | 'AWAY'
  odds             REAL    NOT NULL,
  model_prob       REAL    NOT NULL,
  implied_prob     REAL    NOT NULL,
  edge             REAL    NOT NULL,
  stake_fraction   REAL    NOT NULL,
  stake            REAL    NOT NULL,
  bankroll_before  REAL    NOT NULL,
  created_at       TEXT    NOT NULL,
  status           TEXT    NOT NULL CHECK (status IN ('open','won','lost','void')),
  settled_at       TEXT,
  payout           REAL,
  profit           REAL,
  closing_odds     REAL,
  UNIQUE (session_id, signal_id)
);

CREATE TABLE bankroll_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions(id),
  at          TEXT    NOT NULL,
  bankroll    REAL    NOT NULL,
  reason      TEXT    NOT NULL,               -- 'start' | 'stake' | 'settle' | 'reset'
  bet_id      INTEGER REFERENCES bets(id)
);

CREATE TABLE cache (
  key         TEXT PRIMARY KEY,               -- 'signals' | 'results' | 'meta'
  fetched_at  TEXT NOT NULL,
  payload     TEXT NOT NULL
);
```

All money values are rounded to two decimals. Implementations may store cents as integers to avoid floating point error.

### 5.2 Feed contract

**`signals.json`**
```json
{
  "schema_version": 1,
  "generated_at": "2026-11-09T07:00:00Z",
  "model_version": "dc-elo-0.1.0",
  "signals": [
    {
      "signal_id": "2026-11-09_PL_ARS-CHE_1X2_HOME",
      "match_id": "PL_20261109_ARS_CHE",
      "league": "Premier League",
      "home_team": "Arsenal",
      "away_team": "Chelsea",
      "kickoff_at": "2026-11-09T20:00:00Z",
      "market": "1X2",
      "selection": "HOME",
      "odds": 2.10,
      "bookmaker": "example-book",
      "odds_fetched_at": "2026-11-09T06:55:00Z",
      "model_prob": 0.52,
      "implied_prob": 0.47,
      "edge": 0.092,
      "stake_fraction": 0.021,
      "recommended": true,
      "skip_reason": null,
      "context": {
        "home_form": "WWDWL",
        "away_form": "LDWLW",
        "injuries_home": ["Player A (out)"],
        "injuries_away": [],
        "lineup_confirmed": false,
        "summary": "Model rates Arsenal higher than the market after adjusting for away injuries."
      }
    }
  ]
}
```

**`results.json`**
```json
{
  "schema_version": 1,
  "generated_at": "2026-11-09T23:30:00Z",
  "results": [
    {
      "match_id": "PL_20261109_ARS_CHE",
      "status": "FINISHED",
      "home_goals": 2,
      "away_goals": 1,
      "closing_odds": { "HOME": 2.02, "DRAW": 3.60, "AWAY": 3.90 }
    }
  ]
}
```

Allowed `status` values: `FINISHED`, `POSTPONED`, `CANCELLED`, `ABANDONED`. The last three settle as void.

**`meta.json`**: schema version, latest generation time, model version, minimum supported app version, notice text.

---

## 6. Calculation Specifications

### 6.1 Implied probability and margin removal
For outcomes with decimal odds `o_i`:
`raw_i = 1 / o_i`, `overround = Σ raw_i`, `implied_i = raw_i / overround` (proportional method; Shin method may replace it later).

### 6.2 Edge
`edge = model_prob × odds − 1`

### 6.3 Stake fraction
```
f* = (model_prob × odds − 1) / (odds − 1)
stake_fraction = min(kelly_multiplier × max(f*, 0), per_bet_cap)
```
Defaults: `kelly_multiplier = 0.25`, `per_bet_cap = 0.05`.

### 6.4 Stake amount (device)
```
stake = round(bankroll_at_day_start × stake_fraction, 2)
```
Then apply the daily exposure cap (FR-A5) and minimum stake (FR-A6).

### 6.5 Settlement
- Won: `payout = stake × odds`, `profit = payout − stake`
- Lost: `payout = 0`, `profit = −stake`
- Void: `payout = stake`, `profit = 0`

### 6.6 Metrics
- ROI = total profit / total staked (settled bets)
- Hit rate = won / (won + lost)
- Max drawdown = largest peak-to-trough fall of the bankroll curve
- CLV per bet = `taken_odds / closing_odds − 1`

### 6.7 Model evaluation
- Log loss and Brier score against bookmaker-implied probabilities
- Calibration curve with binned predictions
- Strict chronological splits; no random shuffling; features computed using only data available before kickoff

---

## 7. External Interface Requirements

### 7.1 User interface

| Screen | Contents |
|---|---|
| **Setup** | Budget input, start session, disclaimer acceptance on first launch |
| **Today** | Bankroll header, recommended bets with stake, skipped list, last-updated time |
| **Bet detail** | Probabilities, edge, form, injuries, explanation |
| **Ledger** | Filterable bet list with statuses and bankroll after each bet |
| **Performance** | Bankroll curve, metrics, league breakdown, uncertainty note |
| **Sessions** | Session list, reset budget button, per-session summary |
| **Settings** | Caps, minimum stake, notification time, data refresh |
| **About** | Model explanation, data sources, disclaimer |

UI requirements: dark and light theme, currency symbol selectable (display only), accessible text sizes, clear won/lost color plus icon (not color alone).

### 7.2 Software interfaces
- Odds provider API (for example The Odds API) over HTTPS, API key stored in GitHub Actions secrets, never in the app.
- Results and stats sources (for example football-data.co.uk CSV, API-Football free tier).
- JSON feed hosting on GitHub Pages or Supabase free tier, read-only to the app.
- Expo modules: `expo-sqlite`, `expo-notifications`, `expo-background-fetch` / `expo-task-manager`.

### 7.3 Communication
HTTPS GET only from the app. No credentials in the app. Conditional requests (ETag) used when supported.

---

## 8. Non-Functional Requirements

### 8.1 Performance
| ID | Requirement |
|---|---|
| NFR-P1 | Today screen renders cached data in under 1 second after app launch. |
| NFR-P2 | Feed download and parse completes in under 5 seconds on a typical mobile connection (feed under 500 KB). |
| NFR-P3 | Ledger with 1,000 bets scrolls smoothly (virtualized list). |

### 8.2 Reliability and availability
| ID | Requirement |
|---|---|
| NFR-R1 | The app shall work offline using cached data; actions that need fresh data shall explain why they are unavailable. |
| NFR-R2 | Database writes for freezing and settling shall be atomic (transactions). |
| NFR-R3 | The pipeline shall keep the last valid feed if a run fails. |

### 8.3 Data integrity
| ID | Requirement |
|---|---|
| NFR-I1 | Frozen bet fields are immutable, enforced by database triggers or repository code and covered by tests. |
| NFR-I2 | Bankroll shall always equal starting budget plus the sum of bankroll history changes; a consistency check runs in tests. |

### 8.4 Security and privacy
| ID | Requirement |
|---|---|
| NFR-S1 | No personal data is collected or sent to any server. |
| NFR-S2 | No API secrets are shipped in the APK. |
| NFR-S3 | Feed content is validated against schema before use; malformed data is rejected. |

### 8.5 Cost
| ID | Requirement |
|---|---|
| NFR-C1 | Monthly cost shall be $0. Odds API usage shall stay under the free quota (about 4 leagues x 1 call x 30 days = 120 credits per month for one snapshot per day). |

### 8.6 Maintainability and quality
| ID | Requirement |
|---|---|
| NFR-M1 | Domain logic (stakes, settlement, metrics) shall be pure functions with at least 90% unit test coverage. |
| NFR-M2 | Pipeline sources are behind adapter interfaces so that a provider can be replaced without changing the model or decision code. |
| NFR-M3 | CI shall run tests and linting on every push. |
| NFR-M4 | Model versions are recorded in every signal. |

### 8.7 Compatibility and usability
| ID | Requirement |
|---|---|
| NFR-U1 | Supports Android 8.0 and newer. |
| NFR-U2 | The disclaimer is shown on first launch and in About. |
| NFR-U3 | Amounts and odds are formatted according to device locale. |

### 8.8 Legal and ethical
| ID | Requirement |
|---|---|
| NFR-L1 | The app shall state that all money is virtual and that results do not guarantee real-world outcomes. |
| NFR-L2 | The app shall contain no links to bookmakers, no affiliate content, and no real-money features. |
| NFR-L3 | The app shall include a responsible gambling note. |

---

## 9. Edge Cases and Business Rules

1. **Bankroll reaches zero or below minimum stake:** no new bets are frozen; the app shows "bankroll depleted" and offers a reset.
2. **Match postponed or abandoned:** settled as void; stake returned.
3. **Odds change after generation:** the app always uses the odds in the published signal at freeze time. Real-world odds differences are out of scope and mentioned in About.
4. **Signal changes between fetches:** only signals not yet frozen may update; frozen bets keep their original values.
5. **Phone clock incorrect:** kickoff checks use the feed's `generated_at` as a reference when the device time differs by more than 10 minutes.
6. **Multiple signals on the same match:** at most one selection per match and market is recommended.
7. **Correlated bets on the same day:** covered by the daily exposure cap.
8. **App not opened for several days:** missed days are not backfilled with bets; only results for already frozen bets are settled.

---

## 10. Testing and Acceptance Criteria

### 10.1 Test types
- **Unit:** stake calculation, caps, settlement, metrics, reset logic.
- **Integration:** feed fetch, freeze, settle flow against mock feeds.
- **Pipeline:** schema validation, edge and Kelly calculations against known values, no future data leakage in features.
- **Backtest:** reproducible run with fixed seed and documented results.
- **Manual:** install APK on a real device and complete a multi-day scenario.

### 10.2 Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | With a $100 budget and a signal of stake fraction 0.05, the app freezes a $5.00 bet. |
| AC-2 | After the bet wins at odds 2.00, bankroll becomes $105.00 (100 − 5 + 10). |
| AC-3 | After a loss, bankroll becomes $95.00. |
| AC-4 | Resetting to $300 creates a new active session with bankroll $300.00 and keeps the previous session visible in Sessions. |
| AC-5 | Re-processing the same result does not change the bankroll. |
| AC-6 | A frozen bet's odds, probability and stake do not change when a newer signal file is fetched. |
| AC-7 | Total stakes in one day never exceed the daily exposure cap. |
| AC-8 | The app displays cached data and a stale warning when offline. |
| AC-9 | The pipeline publishes valid JSON daily for 30 consecutive days with at least 95% success. |
| AC-10 | The backtest report includes log loss, Brier score, and a calibration plot compared with bookmaker probabilities. |

---

## 11. Traceability (PRD to SRS)

| PRD ID | SRS requirements |
|---|---|
| P-01 | FR-S1, FR-S2 |
| P-02 | FR-S3 to FR-S6 |
| P-03 | FR-A1 to FR-A6 |
| P-04 | FR-B1 to FR-B4, NFR-I1 |
| P-05 | FR-R1 to FR-R5 |
| P-06 | FR-P1 to FR-P3 |
| P-07 | FR-A7 |
| P-08 | FR-A8 |
| P-09 | FR-S7, FR-P7 |
| P-10 | FR-N1 |
| P-11 | FR-D10, FR-P6 |
| P-12 | FR-P5 |

---

## 12. Future Enhancements (Out of Scope for v1)

- Additional markets: over/under, both teams to score.
- Line movement tracking and multiple daily snapshots.
- Cloud backup and sync of sessions.
- iOS build and Play Store release.
- Push notifications through Firebase Cloud Messaging.
- Lineup-triggered re-evaluation close to kickoff.
- Additional leagues and competitions.
