/**
 * Local calendar days. A "day" is the device local date of kickoff (CLAUDE.md). Functions take an
 * optional `offsetOf(date)` returning `Date#getTimezoneOffset()` minutes so tests can pin a zone.
 */

export type OffsetFn = (d: Date) => number;
const deviceOffset: OffsetFn = (d) => d.getTimezoneOffset();

/** `YYYY-MM-DD` */
export type DayKey = string;

export type DaySlot = 'yesterday' | 'today' | 'tomorrow';

const pad = (n: number) => n.toString().padStart(2, '0');

/** Local day of an instant. */
export function dayKeyOf(at: Date | string, offsetOf: OffsetFn = deviceOffset): DayKey {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) throw new RangeError(`bad date: ${String(at)}`);
  const local = new Date(d.getTime() - offsetOf(d) * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Calendar arithmetic on a day key (no DST issues: works on UTC dates). */
export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The three day chips on Today. */
export function daySlots(now: Date, offsetOf: OffsetFn = deviceOffset): Record<DaySlot, DayKey> {
  const today = dayKeyOf(now, offsetOf);
  return { yesterday: addDays(today, -1), today, tomorrow: addDays(today, 1) };
}

/** Groups items by the local day of `getAt(item)`, each group in input order. */
export function bucketByDay<T>(
  items: readonly T[],
  getAt: (item: T) => string,
  offsetOf: OffsetFn = deviceOffset,
): Map<DayKey, T[]> {
  const out = new Map<DayKey, T[]>();
  for (const item of items) {
    const key = dayKeyOf(getAt(item), offsetOf);
    const list = out.get(key);
    if (list) list.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/** Items whose kickoff falls on the chosen chip's day. */
export function selectDay<T extends { kickoff_at: string }>(
  items: readonly T[],
  slot: DaySlot,
  now: Date,
  offsetOf: OffsetFn = deviceOffset,
): T[] {
  const key = daySlots(now, offsetOf)[slot];
  return items.filter((i) => dayKeyOf(i.kickoff_at, offsetOf) === key);
}
