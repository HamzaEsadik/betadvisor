/** FR-R2 to FR-R6, FR-S6: settling frozen bets from `results.json`. */
import { isReviewDue, settle } from '../../domain/settlement';
import type { MatchResult } from '../../domain/types';
import type { SqlDriver } from '../driver';
import { repos, type BetRecord } from '../repos';

export interface SettleError {
  matchId: string;
  message: string;
}

export interface SettleOutcome {
  settled: BetRecord[];
  /** Results that could not be applied; their bets stay open and nothing of them is written. */
  errors: SettleError[];
}

/**
 * Settles every open bet, in any session, that has a result. Idempotent (FR-R5): a settled bet is
 * skipped, and the database refuses a second settlement or a second `settle` entry. The payout
 * goes to the bankroll history of the bet's own session, so archived bets never touch the active
 * one (FR-S6). Each result is applied atomically; a bad result is reported and the rest go on.
 */
export function settleFromResults(
  db: SqlDriver,
  results: readonly MatchResult[],
  now: Date,
): SettleOutcome {
  const settledAt = now.toISOString();
  const settled: BetRecord[] = [];
  const errors: SettleError[] = [];
  db.transaction(() => {
    const r = repos(db);
    for (const result of results) {
      try {
        const done = db.transaction(() =>
          r.bets.listOpenByMatch(result.match_id).flatMap((bet) => {
            const s = settle(bet, result);
            if (!r.bets.settle(bet.id, s, settledAt)) return [];
            r.bankroll.append({
              sessionId: bet.sessionId,
              at: settledAt,
              deltaCents: s.payoutCents,
              reason: 'settle',
              betId: bet.id,
            });
            return [r.bets.getById(bet.id)!];
          }),
        );
        settled.push(...done);
      } catch (e) {
        errors.push({
          matchId: result.match_id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });
  return { settled, errors };
}

/** FR-R6: flags open bets 72 h past kickoff. Returns the ids newly flagged. */
export function flagStaleBets(db: SqlDriver, now: Date): number[] {
  return db.transaction(() => {
    const r = repos(db);
    return r.bets
      .listOpen()
      .filter((b) => isReviewDue(b, now) && r.bets.setReviewFlag(b.id, true))
      .map((b) => b.id);
  });
}
