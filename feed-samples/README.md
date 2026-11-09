# feed-samples

Scenario feed sets shared by the pipeline and app test suites. Each scenario folder holds `signals*.json`, `results.json` and `meta.json` that validate against [`../schemas`](../schemas). The schema for a file is picked by its name up to the first `.` or `-`.

[`manifest.json`](manifest.json) lists every scenario with a `reference_now` (the clock to use in tests) and a description, and maps every `malformed/` file to the JSON path where validation must fail (`null`: not valid JSON).

| Scenario | Use |
|---|---|
| `day1-normal` | Design 02: three recommended bets today ($1.12 + $2.24 + $1.67 = $5.03 on a $107.20 bankroll), one skipped signal per feed `skip_reason` (one with unknown availability), and one recommended signal tomorrow |
| `day1-results` | Same signals with end-of-day results: one win (ARS-CHE), one loss (BAY-BVB), one postponed (RMA-VAL, void) |
| `no-signals` | Empty signals and results, with a `notice` (design 10) |
| `stale` | Last valid feed generated 26 h before `reference_now` (design 09) |
| `versioned` | `signals.v1.json` then `signals.v2.json`: the ARS-CHE signal moves to version 2 with new odds; the other signal is unchanged |
| `malformed` | One defect per file; every file must be rejected |

Run `make test-pipeline` to validate them (`pipeline/tests/test_samples_valid.py`). Edit the JSON directly; keep `edge` and `stake_fraction` consistent with SRS 6.2 and 6.3, or the test fails.
