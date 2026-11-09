/** Local clock times for display. `offsetOf` pins the zone in tests (see `domain/day`). */
import { dayKeyOf, type DayKey, type OffsetFn } from '@/src/domain/day';

const pad = (n: number) => n.toString().padStart(2, '0');
const deviceOffset: OffsetFn = (d) => d.getTimezoneOffset();

/** `2026-11-09T18:30:00Z` → `"18:30"` in the local zone. */
export function localTime(iso: string, offsetOf: OffsetFn = deviceOffset): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - offsetOf(d) * 60_000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** `"Today"`, `"Yesterday"`, `"Tomorrow"` or `"Mon 9 Nov"` for the local day of `iso`. */
export function relativeDay(iso: string, today: DayKey, offsetOf: OffsetFn = deviceOffset): string {
  const key = dayKeyOf(iso, offsetOf);
  const { y, m, d } = parts(key);
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return dayLabel(key);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function parts(key: DayKey): { y: number; m: number; d: number; wd: string } {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { y, m, d, wd: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]! };
}

/** `"2026-11-09"` → `"Mon 9 Nov"`. */
export function dayLabel(key: DayKey): string {
  const { m, d, wd } = parts(key);
  return `${wd} ${d} ${MONTHS[m - 1]}`;
}

/** `"2026-11-09"` → `"Mon"`. */
export function weekday(key: DayKey): string {
  return parts(key).wd;
}

/** `"2026-11-09"` → `"9 Nov 2026"`, or `"9 Nov"` without the year. */
export function dateLabel(key: DayKey, withYear = true): string {
  const { y, m, d } = parts(key);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** Whole hours between two instants, rounded down. */
export function hoursBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - Date.parse(fromIso)) / 3_600_000);
}
