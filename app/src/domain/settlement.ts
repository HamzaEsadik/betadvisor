/** Settlement: SRS §6.5, FR-R2, FR-R3, FR-R6, §9.2. */
import { assertCents, mulCents } from './money';
import type { Bet, BetStatus, MatchResult, Selection } from './types';

export const REVIEW_AFTER_MS = 72 * 60 * 60 * 1000;

export interface Settlement {
  status: Exclude<BetStatus, 'open'>;
  payoutCents: number;
  profitCents: number;
  /** Closing odds of the bet's selection, when the feed has them (for CLV). */
  closingOdds: number | null;
}

type SettleableBet = Pick<Bet, 'matchId' | 'selection' | 'odds' | 'stakeCents'>;

function winningSelection(result: MatchResult): Selection {
  const { home_goals: home, away_goals: away } = result;
  if (home === null || away === null) {
    throw new Error(`finished match without a score: ${result.match_id}`);
  }
  return home > away ? 'HOME' : home < away ? 'AWAY' : 'DRAW';
}

/**
 * Settles a bet against its match result. Postponed, cancelled and abandoned matches are void and
 * return the stake (§9.2). Won: payout = stake × odds; lost: payout 0.
 */
export function settle(bet: SettleableBet, result: MatchResult): Settlement {
  assertCents(bet.stakeCents);
  if (bet.matchId !== result.match_id) {
    throw new Error(`result ${result.match_id} does not belong to bet on ${bet.matchId}`);
  }
  const closingOdds = result.closing_odds?.[bet.selection] ?? null;
  if (result.status !== 'FINISHED') {
    return { status: 'void', payoutCents: bet.stakeCents, profitCents: 0, closingOdds };
  }
  if (winningSelection(result) === bet.selection) {
    const payout = mulCents(bet.stakeCents, bet.odds);
    return {
      status: 'won',
      payoutCents: payout,
      profitCents: payout - bet.stakeCents,
      closingOdds,
    };
  }
  return { status: 'lost', payoutCents: 0, profitCents: -bet.stakeCents, closingOdds };
}

/** FR-R6: an open bet still unsettled 72 hours after kickoff is flagged for review. */
export function isReviewDue(bet: Pick<Bet, 'status' | 'kickoffAt'>, now: Date): boolean {
  return bet.status === 'open' && now.getTime() - Date.parse(bet.kickoffAt) >= REVIEW_AFTER_MS;
}
