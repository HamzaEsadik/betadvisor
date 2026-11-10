# Part 17: emulator test, release build and Pixel 8 install

Date: 2026-11-10. App 0.1.0, Expo SDK 58, React Native 0.88.

## Setup used

| Item | Value |
|---|---|
| Emulator | `tt_api37` (Pixel 8 profile, Android 17 / API 37, arm64, 4 GB RAM, font scale 1.15) |
| Minimum version | `tt_api26` (Pixel 2 profile, Android 8.0 / API 26) |
| Feed | `feed-samples/` scenarios served on the host (`EXPO_PUBLIC_FEED_BASE_URL=http://10.0.2.2:8787/current/`), copied in fresh per step so file mtimes change |
| Clock | emulator clock set with `adb root` + `date -u` to each scenario's `reference_now` (`auto_time` off) |
| Screenshots | `adb emu screenrecord screenshot` (plain `adb exec-out screencap` returns a black frame on this emulator) |

## Screens

Screenshots are in [`screens/`](screens/), named after the matching `design/screens/NN-*.html`, in light and dark theme. Differences found and fixed:

| Screen | Problem | Fix |
|---|---|---|
| Tab bar (all) | "Performance" clipped at font scale 1.15 on a 411 dp wide screen | Label shrinks to fit (`adjustsFontSizeToFit`) |
| All shrink-to-fit text | Android ignored `adjustsFontSizeToFit` because every type style sets a `lineHeight` | `Text` drops the line height when shrinking (`src/ui/Text.tsx`) |
| Sessions card | ROI "+39.8%" ran into the BETS value | ROI text may shrink inside its column |
| Today (design 02) | Bell action ("Daily reminder") missing from the app bar | Added; opens Settings |
| Bet detail | Bottom of the page ("Not frozen yet") under the navigation bar (edge-to-edge) | Screen takes the bottom safe-area inset |
| Bet detail | "Paris Saint…" truncated in the 110 dp team column | Team names wrap to two lines, centred |
| Ledger | Filter chips clipped 16 dp before the screen edge | Chip rows scroll to the edge |
| Performance | Stat tiles in one row had different heights | Tiles fill their grid cell |

## Scenario (emulator, Android 17)

| Step | Result |
|---|---|
| Setup $100, accept disclaimer | Today shows 3 recommended bets, $4.70 total stake (`day1-normal`) |
| Follow advice | 3 bets frozen, bankroll $95.30 |
| Results arrive (`day1-results`, clock 23:45) | ARS–CHE won (+$4.39), BAY–BVB lost, RMA–VAL void (+$1.56): bankroll $101.25, ROI +39.8% (void excluded), hit rate 50% |
| Reset to $300 | Session 1 closed at $101.25; Session 2 active at $300 |
| Day 2, follow PSG–ASM ($8.37), reset to $100 with the bet open | Session 2 closed at $291.63 with 1 open bet; Session 3 at $100 |
| Day-2 results | The archived bet settles into Session 2 (ROI +62.0%); its final bankroll stays $291.63 (FR-S6); Session 3 unchanged |
| Airplane mode, clock +50 h (AC-8) | "Offline, showing the last saved data" and "Data is 50 hours old" banners; cached data shown |
| Notifications | Permission asked only from the Settings switch; after Allow, the daily alarm is set for 07:30 with a 1 h inexact window (no exact-alarm permission). Moving the clock past the window delivered "New advice is ready"; tapping it opens Today |
| Background task | WorkManager job forced with `adb shell cmd jobscheduler run -f -n androidx.work.systemjobscheduler dev.hamza.betadvisor <id>`: runs, fetches `results.json`, reports SUCCESS. Also from a cold process (app killed with `kill -9`) |

Bugs found by the scenario and fixed:

- **Background task never ran from a cold start.** The task was defined in `app/_layout.tsx`, which expo-router evaluates only when it renders UI, so the headless runtime WorkManager starts had no task. It is now defined in the app entry `app/index.ts` (`package.json` `main`), covered by `src/background/entry.test.ts`.
- **Refresh could be served from the HTTP cache.** React Native's OkHttp keeps a disk cache, and GitHub Pages sends `max-age=600`, so a manual refresh could show a feed up to 10 minutes old (on the emulator it never reached the server). Feed requests now send `Cache-Control: no-cache`; the app's own ETag revalidation is unchanged.

## Minimum Android version (API 26)

The same debug build on `tt_api26`: Setup, start session, Today with a recommended bet, Follow advice ($100 → $97.21) all work. Screenshot: `screens/api26-today-light.png`.

## Release build

- Signing: config plugin `app/plugins/withReleaseSigning.js` reads `BETADVISOR_UPLOAD_*` from `~/.gradle/gradle.properties`. The upload keystore is `~/.android-keystores/betadvisor-upload.jks` (PKCS12, RSA 4096, alias `betadvisor-upload`, SHA-256 `44:85:10:41:…:8C:73`), outside the repo. **Back up the keystore and those properties**: an update to the installed app must be signed with the same key. Packaging a release without them fails instead of signing with the debug key.
- R8 minification is off (`expo-build-properties` `enableMinifyInReleaseBuilds: false`): with it on, the release crashed at start-up because R8 removed the constructor of WorkManager's Room database (`WorkDatabase_Impl.<init>`), and expo-sqlite also warns that it is not R8-safe.
- Only `arm64-v8a` is built (Pixel 8 and Apple Silicon emulators): the APK went from 108 MB to 44 MB.
- Build: `cd app && npm run prebuild:android && cd android && ./gradlew assembleRelease` → `app/android/app/build/outputs/apk/release/app-release.apk`.
- Checks: `apksigner verify` shows the upload certificate; `npm run check:manifest` passes; the APK holds only the production HTTPS feed URL (no `EXPO_PUBLIC_FEED_BASE_URL`, no `10.0.2.2`), and a string scan finds no API keys or tokens (NFR-S2). The emulator ran the release APK against the live feed, including a cold background run.

## Pixel 8

The phone was a Pixel 8a (`akita`, Android 17 / API 37, arm64-v8a).

- `adb install -r app-release.apk` succeeded. Android showed no developer-verification prompt for the sideload.
- The app launched on Setup with no crash, against the live feed ("No matches in the next 48 hours", international break). The WorkManager settlement job was registered.
- Notifications were off until asked for (`POST_NOTIFICATIONS` not granted at launch, as intended).
- A test session started at $10.00 showed "Bankroll depleted" right away: the per-bet cap gives 5% × $10 = $0.50, below the $1 minimum stake. This follows §9.1, but FR-S1 accepts budgets from $10, so $10 to $19.99 can never bet. Open.
- Deferred: the real 30-day session and the notification permission flow on the phone.

## Notes

- The dev client asks for Android 17's new local-network permission (`ACCESS_LOCAL_NETWORK`) to reach Metro. Release builds do not request it.
- On the emulator a tap sent right after a `uiautomator dump` was sometimes dropped. Taps without a dump always worked.
