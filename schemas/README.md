# schemas

JSON Schemas (Draft 2020-12) for the three feed files the pipeline publishes and the app reads (FR-D7):

| File | Schema | Covers |
|---|---|---|
| `signals.json` | [`signals.schema.json`](signals.schema.json) | Latest version of every signal with kickoff from 24 h ago to +48 h |
| `results.json` | [`results.schema.json`](results.schema.json) | Match outcomes for kickoffs in the last 14 days |
| `meta.json` | [`meta.schema.json`](meta.schema.json) | Run metadata, app compatibility, source health |

General rules:

- **Strict.** Every object has `additionalProperties: false`, and every listed field is required (nullable fields are present with `null`). Adding, removing or renaming a field means bumping `schema_version`.
- **Timestamps** are UTC ISO 8601 with a `Z` suffix (`2026-11-09T20:00:00Z`, optional fraction). Offsets such as `+01:00` are rejected.
- **Odds** are decimal odds (> 1). **Probabilities** are in (0, 1). Money never appears in the feed: the app computes stakes from `stake_fraction` and its own bankroll.
- Rules that span several fields or documents (IDs built from their parts, at most one recommended selection per match, edge and stake formulas, version ordering) cannot be expressed in JSON Schema. The pipeline enforces them before publishing and `pipeline/tests/test_samples_valid.py` checks them on the samples.

## `signals.json`

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | Feed contract version |
| `generated_at` | UTC timestamp | When this file was written |
| `model_version` | string, `name-X.Y.Z` | Model that produced the probabilities, e.g. `dc-elo-0.1.0` |
| `signals[]` | array of signal | May be empty |

### Signal

| Field | Type | Meaning |
|---|---|---|
| `signal_id` | `{date}_{league_code}_{home_code}-{away_code}_1X2_{selection}` | Stable identity across versions. `date` is the UTC date of kickoff |
| `version` | integer ≥ 1 | Increments each time the pipeline publishes a changed signal (FR-D8) |
| `versioned_at` | UTC timestamp | When this version was first published. Earlier than or equal to `generated_at` |
| `supersedes` | `null` or `{version, versioned_at}` | The version this one replaces. `null` exactly when `version` is 1 |
| `match_id` | `{league_code}_{yyyymmdd}_{home_code}_{away_code}` | Joins signals to `results.json` |
| `league` | `Premier League` \| `La Liga` \| `Bundesliga` \| `Ligue 1` | Display name |
| `league_code` | `PL` \| `PD` \| `BL1` \| `FL1` | football-data.org competition code |
| `home_team`, `away_team` | string | Display names |
| `home_code`, `away_code` | 2 to 5 uppercase letters or digits | Canonical team codes from `pipeline/data/teams.csv` (badges, IDs) |
| `kickoff_at` | UTC timestamp | The app derives the local "day" from it |
| `market` | `1X2` | Only market in v1 |
| `selection` | `HOME` \| `DRAW` \| `AWAY` | Outcome this signal is about |
| `odds` | number > 1 | Decimal odds used for stake and settlement; frozen by the app at follow time |
| `bookmaker` | string | Source bookmaker key, e.g. `pinnacle` |
| `odds_fetched_at` | UTC timestamp | When the odds were fetched |
| `model_prob` | (0, 1) | Model probability of `selection` |
| `implied_prob` | (0, 1) | Bookmaker probability with the margin removed (SRS 6.1) |
| `edge` | number ≥ -1 | `model_prob × odds − 1` (SRS 6.2) |
| `stake_fraction` | [0, 1] | `min(0.25 × max(f*, 0), per_bet_cap)` (SRS 6.3). `> 0` if recommended, exactly `0` otherwise |
| `recommended` | boolean | Passed every pipeline rule (FR-D5). Recommended signals have `edge > 0` |
| `skip_reason` | `null` or enum below | `null` exactly when `recommended` is true |
| `quality_flags[]` | unique enum values below | Data quality warnings; may be empty |
| `context` | object | Detail screen content (FR-A8) |

`skip_reason` values (pipeline side only):

| Value | Meaning |
|---|---|
| `no_edge` | No outcome has positive edge |
| `below_threshold` | Edge is positive but under the minimum (default 4%) |
| `odds_out_of_range` | Odds outside the allowed range (default 1.40 to 6.00) |
| `missing_data` | Required inputs missing (e.g. availability unknown) |
| `low_confidence` | Model inputs too unsettled to trust the edge |

The app adds its own reasons (`daily_cap`, `min_stake`, `kickoff_passed`) when it computes stakes. They never appear in the feed and the schema rejects them.

`quality_flags` values: `low_data` (an input is missing or unknown, always set when `availability_status` is `unknown`), `stale_odds` (odds older than the run allows), `form_incomplete` (fewer than 5 recent matches), `single_bookmaker` (only one bookmaker quoted the match).

### Context

| Field | Type | Meaning |
|---|---|---|
| `home_form`, `away_form` | 0 to 5 of `W` `D` `L` | Last results, oldest first, newest on the right |
| `availability_status` | `reported` \| `unknown` | `unknown` when the injuries source is missing or failed. Never read `unknown` as "no injuries" |
| `injuries_home`, `injuries_away` | unique strings | Injuries and suspensions, e.g. `Player B (out)`, `Player E (suspended)`. Must be empty when `availability_status` is `unknown`; empty with `reported` means "none reported" |
| `lineup_confirmed` | boolean | Official lineups were published before the run |
| `summary` | 1 to 280 chars | Plain-language explanation shown on the detail screen |

## `results.json`

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | Feed contract version |
| `generated_at` | UTC timestamp | When this file was written |
| `results[]` | array of result | May be empty |
| `results[].match_id` | same format as in signals | Join key |
| `results[].status` | `FINISHED` \| `POSTPONED` \| `CANCELLED` \| `ABANDONED` | The last three settle as void (SRS 6.5) |
| `results[].home_goals`, `away_goals` | integer 0 to 99 or `null` | Required integers when `FINISHED`; otherwise may be `null` |
| `results[].closing_odds` | `null` or `{HOME, DRAW, AWAY}` | Pre-kickoff closing odds for CLV (FR-D10). All three or `null` |

## `meta.json`

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | Feed contract version |
| `generated_at` | UTC timestamp | Latest successful run. The app warns when it is older than 24 h (FR-A9) |
| `model_version` | string, `name-X.Y.Z` | Same as in `signals.json` |
| `min_app_version` | `X.Y.Z` | Oldest app version that understands this feed; older apps ask to update |
| `notice` | `null` or 1 to 500 chars | Message shown to the user (e.g. international break) |
| `sources_health` | object | One entry per data source; `fixtures`, `odds`, `injuries`, `results` are required, other snake_case keys are allowed |
| `sources_health.*.status` | `ok` \| `degraded` \| `failed` \| `disabled` | `disabled` when the source is not configured (e.g. no injuries API key) |
| `sources_health.*.checked_at` | UTC timestamp | When the source was last called |
| `sources_health.*.detail` | `null` or string | Short explanation for anything but `ok` |

## `health.json`

Heartbeat written by the publishing workflow (`betadvisor heartbeat`) after each successful run. Not part of
the app contract; useful for monitoring.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | Contract version |
| `updated_at` | UTC timestamp | Last time any job succeeded |
| `jobs` | object, keys `daily` \| `closing` \| `results` | One entry per job that has succeeded at least once |
| `jobs.*.last_success_at` | UTC timestamp | Last successful run of that job |
| `jobs.*.run_url` | `null` or `https://` URL | The GitHub Actions run |
