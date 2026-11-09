/** Money is integer cents in the domain layer (CLAUDE.md conventions). */

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`not integer cents: ${cents}`);
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
