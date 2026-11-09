# Design reference (split from `BetAdvisor app UI.html`)

The original file is a 3.4 MB bundle. About 98% of it is the React runtime and Barlow font files, which repeat for every board. This folder holds only what implementation needs, split per screen so a single screen can be read cheaply.

## Shared (read once, when building the theme and component library)

| File | Content |
|---|---|
| `shared/tokens.css` | All design tokens: colors for dark (default) and light (`[data-theme="light"]`), spacing, radius, sizes (tap target, app bar, tab bar), fonts, and the type classes (`.bankroll-xl`, `.stat`, `.title-lg`, `.title-md`, `.odds`, `.headline`, `.body`, `.body-strong`, `.caption`, `.overline`) |
| `shared/components.css` | Component styles (`.ba-btn`, `.ba-chip`, cards, tab bar...) |
| `shared/components.js` | Readable React source of the 19 `BetAdvisor.*` components plus the icon SVG paths (Lucide icons) |

Components and their props:

| Component | Props |
|---|---|
| Icon | name, size, strokeWidth, label |
| Button | variant (primary/secondary/...), full, size, disabled, icon, onClick |
| Chip | selected, count, onClick |
| StatusPill | status, label |
| EdgeBadge | edge |
| TeamBadge | code, name, size |
| FormStrip | form, label |
| ProbabilityBar | model, book, compact |
| SignalCard | home, away, homeCode, awayCode, league, kickoff, selection, odds, stake, model, implied, edge, currency, frozen, expired, onPress |
| SkipRow | home, away, league, kickoff, reason, onPress |
| LedgerRow | home, away, date, selection, odds, stake, status, profit, bankroll, frozen, currency |
| StatTile | label, value, hint, tone |
| BankrollHero | label, bankroll, profit, profitPct, openBets, start, currency |
| BankrollChart | points, start, height, startLabel, endLabel, currency |
| Banner | tone, title, children, action, onAction |
| TabBar | items, active, onChange |
| AppBar | title, subtitle, large, onBack, actions |
| SessionCard | title, status, dates, startBudget, finalBankroll, roi, bets, currency, onReset |
| BudgetInput | label, value, currency, presets, hint, error, onChange |

## Screens (390 x 844 boards, 3 to 7 KB each)

| File | Screen | Built in plan part |
|---|---|---|
| `screens/01-setup.html` | Setup (budget, disclaimer, start) | 12 |
| `screens/08-setup-invalid-budget.html` | Setup, validation error | 12 |
| `screens/02-today.html` | Today: hero, day chips, recommended list, Follow advice | 12 |
| `screens/03-today-after-following-scrolled.html` | Today after following: frozen cards, skipped list, footer | 12 |
| `screens/09-today-stale-data.html` | Today with stale-data banner | 12 |
| `screens/10-today-no-signals.html` | Today with no recommended bets | 12 |
| `screens/11-today-bankroll-depleted.html` | Today, bankroll depleted, reset prompt | 12 |
| `screens/12-bet-detail-full-length.html` | Bet detail (probabilities, form, availability, why) | 12 |
| `screens/13-ledger-full-length.html` | Ledger with filters and CSV export | 13 |
| `screens/04-sessions.html` | Sessions list (active and closed) | 13 |
| `screens/05-reset-budget-sheet.html` | Reset budget bottom sheet | 13 |
| `screens/14-performance-full-length.html` | Performance: chart, stats, by league, uncertainty | 14 |
| `screens/06-more.html` | More menu | 14 |
| `screens/07-settings.html` | Settings | 14 |
| `screens/15-about-full-length.html` | About | 14 |

Tab bar (every main screen): Today (`calendar-days`), Ledger (`list-ordered`), Performance (`chart-line`), Sessions (`layers`), More (`settings`).

Template syntax in screen files: `<x-import component-from-global-scope="BetAdvisor.X" ...>` means "render component X with these props", and `{{name}}` refers to values from the `renderVals()` script at the bottom of the file. That script also holds the sample numbers for the screen.

To see the pixel-accurate original, open `../BetAdvisor app UI.html` in a browser.
