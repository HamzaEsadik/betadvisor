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
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const day = new Date(Date.UTC(y, m - 1, d));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    m - 1
  ];
  return `${wd} ${d} ${mon}`;
}

/** Whole hours between two instants, rounded down. */
export function hoursBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - Date.parse(fromIso)) / 3_600_000);
}
