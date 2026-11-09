import type { Settlement } from '../../domain/settlement';
import type { Bet, BetStatus, Market, Selection } from '../../domain/types';
import type { SqlDriver } from '../driver';

/** A frozen bet row (FR-B2). */
export interface BetRecord extends Bet {
  id: number;
  sessionId: number;
  signalId: string;
  signalVersion: number;
  homeTeam: string;
  awayTeam: string;
  modelProb: number;
  impliedProb: number;
  edge: number;
  stakeFraction: number;
  bankrollBeforeCents: number;
  createdAt: string;
  settledAt: string | null;
  reviewFlag: boolean;
}

export type NewBet = Omit<
  BetRecord,
  'id' | 'status' | 'settledAt' | 'payoutCents' | 'profitCents' | 'closingOdds' | 'reviewFlag'
>;

interface BetRow {
  id: number;
  session_id: number;
  signal_id: string;
  signal_version: number;
  match_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  market: Market;
  selection: Selection;
  odds: number;
  model_prob: number;
  implied_prob: number;
  edge: number;
  stake_fraction: number;
  stake_cents: number;
  bankroll_before_cents: number;
  created_at: string;
  status: BetStatus;
  settled_at: string | null;
  payout_cents: number | null;
  profit_cents: number | null;
  closing_odds: number | null;
  review_flag: number;
}

function toRecord(r: BetRow): BetRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    signalId: r.signal_id,
    signalVersion: r.signal_version,
    matchId: r.match_id,
    league: r.league,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    kickoffAt: r.kickoff_at,
    market: r.market,
    selection: r.selection,
    odds: r.odds,
    modelProb: r.model_prob,
    impliedProb: r.implied_prob,
    edge: r.edge,
    stakeFraction: r.stake_fraction,
    stakeCents: r.stake_cents,
    bankrollBeforeCents: r.bankroll_before_cents,
    createdAt: r.created_at,
    status: r.status,
    settledAt: r.settled_at,
    payoutCents: r.payout_cents,
    profitCents: r.profit_cents,
    closingOdds: r.closing_odds,
    reviewFlag: r.review_flag === 1,
  };
}

const ORDER = 'ORDER BY kickoff_at, id';

export function betsRepo(db: SqlDriver) {
  return {
    insert(b: NewBet): number {
      return db.run(
        `INSERT INTO bets (session_id, signal_id, signal_version, match_id, league, home_team,
           away_team, kickoff_at, market, selection, odds, model_prob, implied_prob, edge,
           stake_fraction, stake_cents, bankroll_before_cents, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          b.sessionId,
          b.signalId,
          b.signalVersion,
          b.matchId,
          b.league,
          b.homeTeam,
          b.awayTeam,
          b.kickoffAt,
          b.market,
          b.selection,
          b.odds,
          b.modelProb,
          b.impliedProb,
          b.edge,
          b.stakeFraction,
          b.stakeCents,
          b.bankrollBeforeCents,
          b.createdAt,
        ],
      ).lastInsertRowId;
    },

    getById(id: number): BetRecord | undefined {
      const row = db.get<BetRow>('SELECT * FROM bets WHERE id = ?', [id]);
      return row && toRecord(row);
    },

    listBySession(sessionId: number): BetRecord[] {
      return db
        .all<BetRow>(`SELECT * FROM bets WHERE session_id = ? ${ORDER}`, [sessionId])
        .map(toRecord);
    },

    /** Open bets of every session, archived ones included (FR-S6). */
    listOpen(): BetRecord[] {
      return db.all<BetRow>(`SELECT * FROM bets WHERE status = 'open' ${ORDER}`).map(toRecord);
    },

    listOpenByMatch(matchId: string): BetRecord[] {
      return db
        .all<BetRow>(`SELECT * FROM bets WHERE status = 'open' AND match_id = ? ${ORDER}`, [
          matchId,
        ])
        .map(toRecord);
    },

    /** Writes a settlement if the bet is still open. Returns false when it was already settled. */
    settle(id: number, s: Settlement, settledAt: string): boolean {
      return (
        db.run(
          `UPDATE bets
           SET status = ?, settled_at = ?, payout_cents = ?, profit_cents = ?, closing_odds = ?,
               review_flag = 0
           WHERE id = ? AND status = 'open'`,
          [s.status, settledAt, s.payoutCents, s.profitCents, s.closingOdds, id],
        ).changes === 1
      );
    },

    setReviewFlag(id: number, flag: boolean): boolean {
      return (
        db.run('UPDATE bets SET review_flag = ? WHERE id = ? AND review_flag <> ?', [
          flag ? 1 : 0,
          id,
          flag ? 1 : 0,
        ]).changes === 1
      );
    },
  };
}

export type BetsRepo = ReturnType<typeof betsRepo>;
