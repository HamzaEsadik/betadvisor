/** Performance (design 14): FR-P1 to FR-P7, computed with `domain/metrics` from the database. */
import type { SqlDriver } from '@/src/db/driver';
import { repos, type BankrollEntry, type BetRecord, type SessionRecord } from '@/src/db/repos';
import { dayKeyOf, type DayKey, type OffsetFn } from '@/src/domain/day';
import {
  averageClv,
  bootstrapRoi,
  maxDrawdown,
  profitBy,
  summarize,
  type Drawdown,
  type GroupProfit,
  type Interval,
  type Summary,
} from '@/src/domain/metrics';
import { sessionNumbers } from '../sessions/model';

/** Below this many settled bets the screen warns that the sample is small (FR-P5). */
export const SMALL_SAMPLE_BETS = 100;

export interface SessionChoice {
  id: number;
  number: number;
  active: boolean;
}

export interface Performance {
  session: SessionRecord;
  number: number;
  /** Chips: the active session first, then closed ones newest first (FR-P7). */
  choices: SessionChoice[];
  summary: Summary;
  /** Won, lost and void bets. */
  settled: number;
  /** Current bankroll (active) or the bankroll at close (closed). */
  bankrollCents: number;
  /** Starting budget plus the profit of each settled bet, in settlement order (FR-P1). */
  curveCents: number[];
  drawdown: Drawdown;
  interval: Interval | null;
  clv: { value: number; bets: number } | null;
  byLeague: GroupProfit[];
  byMarket: GroupProfit[];
  startDay: DayKey;
  /** null while the session is active. */
  endDay: DayKey | null;
}

/**
 * Settled bankroll curve: stakes of open bets are not losses yet, so the curve moves only when a
 * bet settles, by that bet's profit. It starts at the starting budget.
 */
export function settledCurve(
  startCents: number,
  history: readonly BankrollEntry[],
  bets: readonly Pick<BetRecord, 'id' | 'stakeCents'>[],
): number[] {
  const stakes = new Map(bets.map((b) => [b.id, b.stakeCents]));
  const curve = [startCents];
  let equity = startCents;
  for (const e of history) {
    if (e.reason !== 'settle') continue;
    const stake = stakes.get(e.betId!);
    if (stake === undefined) throw new Error(`settle entry ${e.id} has no bet in this session`);
    equity += e.deltaCents - stake;
    curve.push(equity);
  }
  return curve;
}

/** The session asked for (`?session=<id>`), else the active one; null before Setup. */
export function loadPerformance(
  db: SqlDriver,
  sessionId: number | null,
  offsetOf?: OffsetFn,
): Performance | null {
  const r = repos(db);
  const sessions = r.sessions.list();
  const session =
    sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.status === 'active');
  if (!session) return null;
  const numbers = sessionNumbers(sessions);
  const bets = r.bets.listBySession(session.id);
  const summary = summarize(bets);
  const curveCents = settledCurve(
    session.startingBudgetCents,
    r.bankroll.listBySession(session.id),
    bets,
  );
  const choices = sessions
    .map((s) => ({ id: s.id, number: numbers.get(s.id)!, active: s.status === 'active' }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.id - a.id);
  return {
    session,
    number: numbers.get(session.id)!,
    choices,
    summary,
    settled: summary.won + summary.lost + summary.void,
    bankrollCents:
      session.status === 'active' ? r.bankroll.current(session.id) : session.finalBankrollCents!,
    curveCents,
    drawdown: maxDrawdown(curveCents),
    interval: bootstrapRoi(bets),
    clv: averageClv(bets),
    byLeague: profitBy(bets, 'league'),
    byMarket: profitBy(bets, 'market'),
    startDay: dayKeyOf(session.startedAt, offsetOf),
    endDay: session.endedAt === null ? null : dayKeyOf(session.endedAt, offsetOf),
  };
}

/** `"9, 8, 7 and 7"`. */
export function listing(items: readonly (string | number)[]): string {
  const xs = items.map(String);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export const MARKET_LABELS: Readonly<Record<string, string>> = { '1X2': 'Match result (1X2)' };
