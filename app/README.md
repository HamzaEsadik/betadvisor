# app

BetAdvisor Android app: Expo SDK 58, React Native 0.88, React 19.3, TypeScript strict, expo-router.

| Path                                                        | Contents                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `app/`                                                      | Routes (expo-router). `(tabs)/` holds Today, Ledger, Performance, Sessions, More                 |
| `src/theme/`                                                | `tokens.ts` (port of `design/shared/tokens.css`), `ThemeProvider` (system / dark / light), fonts |
| `src/ui/`                                                   | Shared UI. `icons.ts` is generated from the design `ICONS` map                                   |
| `src/domain/`                                               | Pure logic (money in integer cents). Coverage threshold 90%                                      |
| `src/db/ api/ features/ background/ notifications/ config/` | Filled in Parts 8 to 15                                                                          |
| `src/test/`                                                 | Test helpers (`renderWithTheme`)                                                                 |

Commands: `npm run lint` (ESLint + Prettier), `npm run typecheck`, `npm test` (Jest with coverage), `npx expo-doctor`, `npm run prebuild:android`.

The feed base URL is `expo.extra.feedBaseUrl` in `app.json`.

## Release APK (sideload)

The upload key lives outside the repo: `~/.gradle/gradle.properties` holds `BETADVISOR_UPLOAD_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS` and `_KEY_PASSWORD` (see `plugins/withReleaseSigning.js`). Back up the keystore and these properties: updates must be signed with the same key.

```
npm run prebuild:android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

R8 minification is off and only `arm64-v8a` is built (`expo-build-properties` in `app.json`). Part 17 notes: `../docs/part17-device-test.md`.
