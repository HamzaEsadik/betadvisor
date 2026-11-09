/** Ledger (design 13): FR-L1 rows, FR-L2 filters, grouping by local day. Pure functions. */
import type { BankrollEntry, BetRecord } from '@/src/db/repos';
import { addDays, dayKeyOf, type DayKey, type OffsetFn } from '@/src/domain/day';
import type { BetStatus } from '@/src/domain/types';
import { selectionName } from '@/src/ui/SignalCard';
import { dateLabel, dayLabel, localTime, weekday } from '../time';

export interface LedgerBet extends BetRecord {
  /** Bankroll after the bet's latest entry: its stake while open, its settlement after. */
  bankrollAfterCents: number;
  /** Local calendar day of kickoff. */
  day: DayKey;
}

/** Joins each bet with the bankroll after it; newest kickoff first (FR-L1). */
export function ledgerBets(
  bets: readonly BetRecord[],
  history: readonly BankrollEntry[],
  offsetOf?: OffsetFn,
): LedgerBet[] {
  const after = new Map<number, number>();
  for (const e of history) if (e.betId !== null) after.set(e.betId, e.bankrollCents);
  return bets
    .map((b) => {
      const bankrollAfterCents = after.get(b.id);
      if (bankrollAfterCents === undefined) throw new Error(`bet ${b.id} has no bankroll entry`);
      return { ...b, bankrollAfterCents, day: dayKeyOf(b.kickoffAt, offsetOf) };
    })
    .sort((a, b) =>
      a.kickoffAt === b.kickoffAt ? b.id - a.id : a.kickoffAt < b.kickoffAt ? 1 : -1,
    );
}

export type StatusFilter = 'all' | BetStatus;

export const STATUS_FILTERS: readonly { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'void', label: 'Void' },
];

/** Inclusive local-day range; a null end is open. */
export interface DateRange {
  from: DayKey | null;
  to: DayKey | null;
}

export const ALL_DATES: DateRange = { from: null, to: null };

export interface LedgerFilter {
  status: StatusFilter;
  /** null = all leagues. */
  league: string | null;
  dates: DateRange;
}

export const NO_FILTER: LedgerFilter = { status: 'all', league: null, dates: ALL_DATES };

const inRange = (day: DayKey, r: DateRange) =>
  (r.from === null || day >= r.from) && (r.to === null || day <= r.to);

/** Applies every filter (FR-L2). */
export function applyFilter(bets: readonly LedgerBet[], f: LedgerFilter): LedgerBet[] {
  return bets.filter(
    (b) =>
      (f.status === 'all' || b.status === f.status) &&
      (f.league === null || b.league === f.league) &&
      inRange(b.day, f.dates),
  );
}

/**
 * Chip counts per status. They follow the league and date filters but not the status filter, so
 * every chip shows how many bets selecting it would list.
 */
export function statusCounts(
  bets: readonly LedgerBet[],
  f: LedgerFilter,
): Record<StatusFilter, number> {
  const base = applyFilter(bets, { ...f, status: 'all' });
  const out: Record<StatusFilter, number> = { all: base.length, open: 0, won: 0, lost: 0, void: 0 };
  for (const b of base) out[b.status] += 1;
  return out;
}

/** Leagues in the session, most bets first, then by name. */
export function leaguesOf(bets: readonly LedgerBet[]): string[] {
  const n = new Map<string, number>();
  for (const b of bets) n.set(b.league, (n.get(b.league) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}

export type DatePreset = 'all' | 'today' | 'last7' | 'last30';

export const DATE_PRESETS: readonly { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
];

export function presetRange(preset: DatePreset, today: DayKey): DateRange {
  switch (preset) {
    case 'all':
      return ALL_DATES;
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
  }
}

/** Short text for the date chip. */
export function rangeLabel(r: DateRange, today: DayKey): string {
  const preset = DATE_PRESETS.find((p) => {
    const pr = presetRange(p.key, today);
    return pr.from === r.from && pr.to === r.to;
  });
  if (preset) return preset.label;
  if (r.from !== null && r.to !== null) {
    return r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)} – ${dayLabel(r.to)}`;
  }
  return r.from !== null ? `From ${dayLabel(r.from)}` : `Until ${dayLabel(r.to!)}`;
}

/** A day header or one bet, flattened for the virtualized list (NFR-P3). */
export type LedgerItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'bet'; key: string; bet: LedgerBet; first: boolean; last: boolean };

/** `"Today · Mon 9 Nov"` for today, `"Sun 8 Nov"` otherwise (design 13). */
export function dayHeader(day: DayKey, today: DayKey): string {
  return day === today ? `Today · ${dayLabel(day)}` : dayLabel(day);
}

/** Groups bets (already newest first) under day headers. */
export function groupByDay(bets: readonly LedgerBet[], today: DayKey): LedgerItem[] {
  const items: LedgerItem[] = [];
  bets.forEach((bet, i) => {
    const prev = bets[i - 1];
    const next = bets[i + 1];
    const first = prev?.day !== bet.day;
    if (first)
      items.push({ type: 'header', key: `day-${bet.day}`, title: dayHeader(bet.day, today) });
    items.push({ type: 'bet', key: `bet-${bet.id}`, bet, first, last: next?.day !== bet.day });
  });
  return items;
}

/** Row date: `"Today 21:00"`, `"Sun 17:30"` within the last week, else `"12 Oct 17:30"`. */
export function rowDate(bet: LedgerBet, today: DayKey, offsetOf?: OffsetFn): string {
  const time = localTime(bet.kickoffAt, offsetOf);
  if (bet.day === today) return `Today ${time}`;
  const recent = bet.day >= addDays(today, -6) && bet.day <= addDays(today, 6);
  return `${recent ? weekday(bet.day) : dateLabel(bet.day, false)} ${time}`;
}

export function pickName(bet: Pick<BetRecord, 'selection' | 'homeTeam' | 'awayTeam'>): string {
  return selectionName(bet.selection, bet.homeTeam, bet.awayTeam);
}
