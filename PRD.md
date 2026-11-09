# Product Requirements Document (PRD)

**Product (working title):** BetAdvisor
**Document version:** 1.0
**Date:** 2026-11-09
**Status:** Draft
**Type:** Portfolio project (paper trading, no real money)

---

## 1. Overview

BetAdvisor is a free Android mobile app (React Native + Expo) that acts as a **daily football betting advisor with a simulated bankroll**. The user sets a virtual budget (for example $100). Every day the app shows which matches in the Spanish, French, English and German top leagues offer a statistical edge over the bookmaker odds, how much of the bankroll to stake on each, and which matches to skip. The app records every recommendation, settles it when the match ends, and shows how the bankroll evolves over time. After a month the user can see how the virtual budget performed. The user can reset the budget (for example to $300) and start a fresh session while old sessions stay archived.

> The app is an educational and analytical project. It does not place real bets, handle real money, or provide financial or gambling advice.

## 2. Problem Statement

- Most "betting tip" products pick match winners without showing the reasoning, the stake, or an honest track record.
- Bettors lose money mainly through poor stake sizing and betting on every game, not only through bad picks.
- There is no simple, free way to test whether a statistical betting strategy works over a month using a realistic bankroll, without risking real money.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Recommend, per day, only the bets with positive expected value, with a stake sized from the current bankroll.
2. Simulate a bankroll end to end: set budget, follow advice, settle results, reset.
3. Provide an honest, tamper-proof history of recommendations and outcomes.
4. Cost $0 to build and run (free tiers only).
5. Demonstrate a complete engineering pipeline: data ingestion, modeling, decision logic, mobile app, scheduled automation.

### 3.2 Non-Goals

- Placing real bets or integrating with bookmakers or payment systems.
- Accepting deposits or holding any money.
- User accounts, social features, or leaderboards (v1).
- iOS support, Play Store publishing (v1).
- Guaranteeing profit. The product explicitly does not promise returns.
- Leagues outside the Big 4 (v1).

## 4. Target Users

| Persona | Description | Need |
|---|---|---|
| **Portfolio reviewer** (primary) | Recruiter or engineer evaluating the project | See a complete, rigorous, working system with honest evaluation |
| **Curious bettor** | Football fan interested in data-driven betting | Test a strategy risk-free with a virtual budget |
| **Developer (owner)** | The project author | Learn and demonstrate full-stack data and mobile skills |

## 5. Scope

### 5.1 Leagues

La Liga (Spain), Ligue 1 (France), Premier League (England), Bundesliga (Germany).

### 5.2 Markets (v1)

- Match result (1X2): home, draw, away.
- Optionally in a later version: Over/Under 2.5 goals, both teams to score.

### 5.3 Components

1. **Prediction pipeline** (Python, scheduled): fetches fixtures, odds, team and player data, produces daily signals and results.
2. **Static data feed** (JSON on free hosting): the contract between pipeline and app.
3. **Mobile app** (React Native + Expo, Android): sessions, bankroll, daily advice, ledger, performance, history.

## 6. User Stories

### Budget and sessions
- As a user, I can enter a starting budget so the app begins a new session with that bankroll.
- As a user, I can reset the budget to a new amount (for example $300) so a fresh session starts from that amount.
- As a user, I can view past sessions with their final results so I can compare runs.

### Daily advice
- As a user, I can open the Today screen and see the recommended bets with stake in dollars, odds, and the reasoning summary.
- As a user, I can see which matches were skipped and why (no edge, low confidence, exposure cap reached).
- As a user, I can see key data behind each recommendation: team form, injuries and suspensions, model probability versus bookmaker probability.

### Tracking
- As a user, I can see every bet with its status (open, won, lost, void) and the bankroll after it.
- As a user, I can see that a recommendation never changes after it was made.

### Performance
- As a user, I can see a bankroll curve, ROI, hit rate, profit by league, and maximum drawdown.
- As a user, I can see the uncertainty of the results, since a month is a small sample.

### Reminders
- As a user, I can receive a local notification when new daily advice is available.

## 7. Functional Requirements (Summary)

Detailed, numbered requirements are in the SRS. At product level:

| ID | Requirement | Priority |
|---|---|---|
| P-01 | Create a session with a starting budget | Must |
| P-02 | Reset the budget and archive the previous session | Must |
| P-03 | Show daily recommendations with stake sizing derived from current bankroll | Must |
| P-04 | Freeze each accepted recommendation at fetch time | Must |
| P-05 | Settle bets automatically from published results | Must |
| P-06 | Bankroll curve and core performance metrics | Must |
| P-07 | Skipped games list with reasons | Should |
| P-08 | Per-recommendation data panel (form, injuries, probabilities) | Should |
| P-09 | Session history and comparison | Should |
| P-10 | Local notifications for new advice | Could |
| P-11 | Closing line value tracking | Could |
| P-12 | Confidence intervals on performance | Could |

## 8. How Advice Is Produced (Product View)

1. The model estimates the probability of each outcome for each upcoming match, using team strength, form, home/away effect, rest days and player availability.
2. The probability is compared with the bookmaker's odds. If `model probability × odds − 1` is above the minimum edge threshold, the bet is a candidate.
3. The stake is a conservative fraction of the Kelly criterion, capped per bet and per day.
4. All other matches are marked "skip".

The app shows this in plain language, not only numbers.

## 9. Success Metrics

### Product and engineering
| Metric | Target |
|---|---|
| Complete session lifecycle (create, follow, settle, reset) works offline after the daily fetch | 100% |
| Daily pipeline success rate over 30 days | at least 95% |
| Recommendations that are modified after creation | 0 |
| Monthly infrastructure cost | $0 |

### Model quality (evaluation, not a promise)
| Metric | Target |
|---|---|
| Log loss on backtest versus bookmaker-implied probabilities | within a small margin of the market |
| Calibration | predicted probabilities match observed frequencies in calibration plot |
| Live paper-trading period | at least 30 days logged, results reported with uncertainty |

Profit is reported but is **not** a success criterion, since one month is too short to separate skill from luck.

## 10. Constraints and Assumptions

- **Cost:** only free tiers (GitHub Actions, GitHub Pages or Supabase free tier, free odds API tier).
- **Platform:** Android only, built locally and distributed as an APK through sideloading.
- **Odds data:** free API limits mean about one odds snapshot per league per day. Line movement is not tracked in v1.
- **Language:** TypeScript for the app and Python for the pipeline (assumption, can be changed).
- **Season:** the 2026-27 season is in progress, so live data is available now.
- **Data terms:** scraping sources must respect their terms of service. Prefer official APIs and open datasets.

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Free odds quota exhausted | No signals | One call per league per day, cache responses, fallback to football-data.co.uk |
| Model has no real edge | Negative results | Frame as rigorous evaluation, show calibration and CLV, explain results honestly |
| Small sample after one month | Misleading conclusions | Show confidence intervals and a variance warning |
| Injury and lineup data unreliable or late | Wrong probabilities | Treat availability as an adjustment, flag low-confidence cases, skip when data is missing |
| Data source changes or blocks access | Pipeline failure | Isolate each source behind an adapter, add health checks and failure alerts |
| Legal and ethical concerns around gambling | Reputation, compliance | Paper money only, clear disclaimer, no bookmaker links, no real-money features |
| Stale data on the phone | Wrong stakes | Show last-updated time, refuse to freeze bets for matches that already started |

## 12. Milestones

| Phase | Deliverable |
|---|---|
| **M1 Pipeline MVP** | Historical data load, Elo and Poisson baseline, edge and Kelly calculation, `signals.json` output |
| **M2 App skeleton** | Expo app with sessions, ledger, reset flow and mock signals |
| **M3 Integration** | Live feed, freezing, automatic settlement |
| **M4 Performance and history** | Charts, metrics, session comparison |
| **M5 Model upgrade** | xG features, availability adjustment, gradient boosting, calibration |
| **M6 Live paper trading** | At least 30 days of live logging and a published results report |
| **M7 Polish** | Notifications, README, architecture diagram, demo video |

## 13. Disclaimer (to appear in app and README)

This app uses virtual money for educational purposes. It is not financial, investment, or gambling advice. Betting involves risk and many bettors lose money. If gambling is a problem for you or someone you know, seek help from a local support organization.

## 14. Open Questions

1. Which odds provider will be the primary source after the free tier limits are known?
2. Which source will supply injuries and suspensions reliably and free of charge?
3. Should markets beyond 1X2 be included in v1 or deferred?
4. Is a minimum stake of $1 acceptable for small bankrolls?
5. Should the app support multiple parallel sessions or only one active session?
