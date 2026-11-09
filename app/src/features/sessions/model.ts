/** Sessions list (design 04, FR-S7) read from the database. */
import type { SqlDriver } from '@/src/db/driver';
import { repos, type SessionRecord } from '@/src/db/repos';
import { dayKeyOf, type OffsetFn } from '@/src/domain/day';
import { summarize } from '@/src/domain/metrics';
import { dateLabel } from '../time';

export interface SessionRow {
  session: SessionRecord;
  /** 1 for the first session ever started. */
  number: number;
  /** Current bankroll (active) or the bankroll stored at close (closed). */
  bankrollCents: number;
  /** Live: archived open bets keep settling after a reset (FR-S6). */
  roi: number | null;
  bets: number;
  openBets: number;
  openStakeCents: number;
}

/** `"Session 2"` numbering: sessions in start order. */
export function sessionNumbers(sessions: readonly SessionRecord[]): Map<number, number> {
  const ids = sessions.map((s) => s.id).sort((a, b) => a - b);
  return new Map(ids.map((id, i) => [id, i + 1]));
}

/** Every session, active first then newest first (FR-S7). */
export function listSessionRows(db: SqlDriver): SessionRow[] {
  const r = repos(db);
  const sessions = r.sessions.list();
  const numbers = sessionNumbers(sessions);
  return sessions
    .map((session) => {
      const bets = r.bets.listBySession(session.id);
      const open = bets.filter((b) => b.status === 'open');
      const stats = summarize(bets);
      return {
        session,
        number: numbers.get(session.id)!,
        bankrollCents:
          session.status === 'active'
            ? r.bankroll.current(session.id)
            : session.finalBankrollCents!,
        roi: stats.roi,
        bets: stats.bets,
        openBets: open.length,
        openStakeCents: open.reduce((t, b) => t + b.stakeCents, 0),
      };
    })
    .sort((a, b) =>
      a.session.status === b.session.status
        ? b.session.id - a.session.id
        : a.session.status === 'active'
          ? -1
          : 1,
    );
}

/** `"12 Oct 2026 – today"`, `"14 Sep – 11 Oct 2026"` (design 04). */
export function sessionDates(s: SessionRecord, offsetOf?: OffsetFn): string {
  const start = dayKeyOf(s.startedAt, offsetOf);
  if (s.endedAt === null) return `${dateLabel(start)} – today`;
  const end = dayKeyOf(s.endedAt, offsetOf);
  if (start === end) return dateLabel(end);
  return `${dateLabel(start, start.slice(0, 4) !== end.slice(0, 4))} – ${dateLabel(end)}`;
}
