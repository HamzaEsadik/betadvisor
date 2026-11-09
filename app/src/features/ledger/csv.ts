/** Ledger CSV export (FR-L3): RFC 4180, every bet column, money as decimal amounts. */
import { fromCents } from '@/src/domain/money';
import type { LedgerBet } from './model';

type Cell = string | number | boolean | null;

const money = (cents: number | null) => (cents === null ? null : fromCents(cents).toFixed(2));

const COLUMNS: readonly [string, (b: LedgerBet) => Cell][] = [
  ['bet_id', (b) => b.id],
  ['session_id', (b) => b.sessionId],
  ['signal_id', (b) => b.signalId],
  ['signal_version', (b) => b.signalVersion],
  ['match_id', (b) => b.matchId],
  ['league', (b) => b.league],
  ['home_team', (b) => b.homeTeam],
  ['away_team', (b) => b.awayTeam],
  ['kickoff_at', (b) => b.kickoffAt],
  ['market', (b) => b.market],
  ['selection', (b) => b.selection],
  ['odds', (b) => b.odds],
  ['model_prob', (b) => b.modelProb],
  ['implied_prob', (b) => b.impliedProb],
  ['edge', (b) => b.edge],
  ['stake_fraction', (b) => b.stakeFraction],
  ['stake', (b) => money(b.stakeCents)],
  ['bankroll_before', (b) => money(b.bankrollBeforeCents)],
  ['bankroll_after', (b) => money(b.bankrollAfterCents)],
  ['created_at', (b) => b.createdAt],
  ['status', (b) => b.status],
  ['settled_at', (b) => b.settledAt],
  ['payout', (b) => money(b.payoutCents)],
  ['profit', (b) => money(b.profitCents)],
  ['closing_odds', (b) => b.closingOdds],
  ['review_flag', (b) => b.reviewFlag],
];

export const CSV_HEADER = COLUMNS.map(([name]) => name);

/** One RFC 4180 field: quoted when it holds a comma, a quote or a line break. */
export function csvField(v: Cell): string {
  const s = v === null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header plus one record per bet, CRLF line endings, a final CRLF. */
export function ledgerCsv(bets: readonly LedgerBet[]): string {
  const lines = [CSV_HEADER.map(csvField).join(',')];
  for (const b of bets) lines.push(COLUMNS.map(([, get]) => csvField(get(b))).join(','));
  return lines.map((l) => `${l}\r\n`).join('');
}

/** `betadvisor-session-2-2026-11-09.csv` */
export function csvFileName(sessionNumber: number, today: string): string {
  return `betadvisor-session-${sessionNumber}-${today}.csv`;
}
