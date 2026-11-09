/** Display helpers that mirror `BetAdvisor.format` in design/shared/components.js. */

/** `0.483` → `"48%"` (`format.pct`). */
export function pct(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** `0.092` → `"+9.2%"`, `-0.05` → `"-5.0%"`. */
export function signedPct(ratio: number, decimals = 1): string {
  return `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(decimals)}%`;
}

/** Decimal odds with two decimals (`2.1` → `"2.10"`). */
export function odds(value: number): string {
  return value.toFixed(2);
}

/** Three-letter fallback badge code from a team name (`code3` in the design). */
export function code3(name: string | undefined): string {
  return (
    String(name ?? '?')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase() || '?'
  );
}
