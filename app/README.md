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
