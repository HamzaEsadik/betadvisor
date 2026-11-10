/** FR-R1, FR-R2, FR-R6: one settlement pass over the results in hand. */
import type { ResultsFeed } from '../api/schemas';
import type { SqlDriver } from '../db/driver';
import { flagStaleBets, settleFromResults, type SettleError } from '../db/services';

export interface SettlePass {
  settled: number;
  flagged: number;
  errors: SettleError[];
}

/**
 * Settles every open bet that has a result, then flags bets 72 h past kickoff that are still
 * open. Idempotent: a second pass over the same results changes nothing. With no results document
 * (nothing cached yet, offline) only the review flags are updated.
 */
export function settleAndFlag(db: SqlDriver, results: ResultsFeed | null, now: Date): SettlePass {
  const out = settleFromResults(db, results?.results ?? [], now);
  const flagged = flagStaleBets(db, now);
  for (const e of out.errors) {
    // Loud: a result that cannot be applied leaves its bet open.
    console.error(`settlement failed for ${e.matchId}: ${e.message}`);
  }
  return { settled: out.settled.length, flagged: flagged.length, errors: out.errors };
}

export const changedAnything = (p: SettlePass): boolean => p.settled > 0 || p.flagged > 0;
