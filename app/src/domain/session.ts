/** Session rules: budget validation (FR-S1) and the reset plan (FR-S3 to FR-S6). */
import { assertCents } from './money';
import { summarize, type Summary } from './metrics';
import type { Bet } from './types';

export const MIN_BUDGET_CENTS = 10_00;
export const MAX_BUDGET_CENTS = 1_000_000_00;

export type BudgetError =
  'empty' | 'not_a_number' | 'too_many_decimals' | 'below_min' | 'above_max';

export type BudgetResult = { ok: true; cents: number } | { ok: false; error: BudgetError };

/**
 * Parses what the user typed as a starting budget. Accepts digits with one optional `.` or `,`
 * decimal separator, an optional leading currency symbol and surrounding spaces. No thousands
 * separators: "1,000" reads as three decimals and is rejected rather than guessed at.
 */
export function validateBudget(input: string): BudgetResult {
  const text = input.trim().replace(/^[$€£¥]\s*/, '');
  if (text === '') return { ok: false, error: 'empty' };
  const m = /^(\d+)(?:[.,](\d*))?$/.exec(text);
  if (!m) return { ok: false, error: 'not_a_number' };
  const whole = m[1]!;
  const frac = m[2] ?? '';
  if (frac.length > 2) return { ok: false, error: 'too_many_decimals' };
  if (whole.length > 12) return { ok: false, error: 'above_max' };
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (cents < MIN_BUDGET_CENTS) return { ok: false, error: 'below_min' };
  if (cents > MAX_BUDGET_CENTS) return { ok: false, error: 'above_max' };
  return { ok: true, cents };
}

export interface ActiveSession {
  id: number;
  startingBudgetCents: number;
  startedAt: string;
}

export type SessionBet = Bet & { id: number };

export interface ResetPlan {
  close: {
    sessionId: number;
    endedAt: string;
    finalBankrollCents: number;
    stats: Summary;
  };
  /** Open bets that stay in the archived session and still settle there (FR-S6). */
  archivedOpenBetIds: number[];
  /** Shown in the confirmation (FR-S5). */
  confirmation: { currentBankrollCents: number; openBets: number; openStakeCents: number };
  newSession: { startingBudgetCents: number; startedAt: string };
}

/**
 * What a reset does (FR-S3): close the active session with its final bankroll and statistics and
 * start a new one. Nothing is deleted (FR-S4); open bets are listed so they stay archived.
 */
export function planReset(
  active: ActiveSession,
  bets: readonly SessionBet[],
  currentBankrollCents: number,
  newBudgetCents: number,
  now: Date,
): ResetPlan {
  assertCents(currentBankrollCents);
  if (newBudgetCents < MIN_BUDGET_CENTS || newBudgetCents > MAX_BUDGET_CENTS) {
    throw new RangeError(`budget out of range: ${newBudgetCents}`);
  }
  assertCents(newBudgetCents);
  const at = now.toISOString();
  const open = bets.filter((b) => b.status === 'open');
  return {
    close: {
      sessionId: active.id,
      endedAt: at,
      finalBankrollCents: currentBankrollCents,
      stats: summarize(bets),
    },
    archivedOpenBetIds: open.map((b) => b.id),
    confirmation: {
      currentBankrollCents,
      openBets: open.length,
      openStakeCents: open.reduce((s, b) => s + b.stakeCents, 0),
    },
    newSession: { startingBudgetCents: newBudgetCents, startedAt: at },
  };
}
