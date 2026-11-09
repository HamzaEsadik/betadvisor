/** Money is integer cents in the domain layer (CLAUDE.md conventions). */

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`not integer cents: ${cents}`);
}

/**
 * Rounds a fractional cent amount to whole cents, half away from zero, like SRS `round(x, 2)` on
 * dollars. The value is first snapped to 12 significant digits so float noise such as
 * `224.49999999999997` (from a product that is exactly .5 in decimal) rounds the intended way.
 */
export function roundCents(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite amount: ${x}`);
  const snapped = Number(x.toPrecision(12));
  const r = Math.sign(snapped) * Math.round(Math.abs(snapped));
  return r === 0 ? 0 : r; // no -0
}

/** `12.34` dollars → `1234` cents. */
export function toCents(amount: number): number {
  return roundCents(amount * 100);
}

/** `1234` cents → `12.34` (for display maths and charts only, never stored). */
export function fromCents(cents: number): number {
  assertCents(cents);
  return cents / 100;
}

/** `cents × factor`, rounded to whole cents (stake = bankroll × fraction, payout = stake × odds). */
export function mulCents(cents: number, factor: number): number {
  assertCents(cents);
  return roundCents(cents * factor);
}

/** `1234567` → `"$12,345.67"`, `-503` → `"-$5.03"` (matches `format.money` in the design). */
export function formatMoney(cents: number, currency = '$'): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${currency}${units}.${frac}`;
}

/** Like `formatMoney` with an explicit `+` for positive amounts (`format.signed`). */
export function formatSignedMoney(cents: number, currency = '$'): string {
  return (cents > 0 ? '+' : '') + formatMoney(cents, currency);
}

/**
 * Device-locale money (NFR-U3): grouping and decimal separators come from `locale`, the symbol is
 * the user's chosen one. `formatMoneyLocale(123456, 'de-DE', '€')` → `"€1.234,56"`.
 */
export function formatMoneyLocale(cents: number, locale: string, currency = '$'): string {
  assertCents(cents);
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${cents < 0 ? '-' : ''}${currency}${n}`;
}

/** Decimal odds in the device locale with two decimals: `2.1` → `"2.10"` / `"2,10"`. */
export function formatOdds(odds: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(odds);
}

/** A ratio as a percentage: `0.092` → `"9.2%"` (one decimal by default). */
export function formatPercent(ratio: number, locale: string, decimals = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ratio);
}
