/**
 * NFR-I2: bankroll = starting budget + Σ bankroll history deltas. Also checks that every entry's
 * running bankroll is right, that a closed session's final bankroll matches its reset entry, that each bet's stake and payout appear exactly once in its own
 * session's history, and that at most one session is active. Used by tests and dev builds.
 */
import type { SqlDriver } from './driver';
import { repos } from './repos';

export interface ConsistencyReport {
  ok: boolean;
  issues: string[];
}

export function checkConsistency(db: SqlDriver): ConsistencyReport {
  const r = repos(db);
  const issues: string[] = [];
  const sessions = r.sessions.list();
  const active = sessions.filter((s) => s.status === 'active');
  if (active.length > 1) issues.push(`${active.length} active sessions`);

  for (const s of sessions) {
    const tag = `session ${s.id}`;
    const history = r.bankroll.listBySession(s.id);
    let running = s.startingBudgetCents;
    for (const e of history) {
      running += e.deltaCents;
      if (e.bankrollCents !== running) {
        issues.push(`${tag}: entry ${e.id} says ${e.bankrollCents}, running sum is ${running}`);
      }
      if (running < 0) issues.push(`${tag}: negative bankroll at entry ${e.id}`);
    }
    if (history[0]?.reason !== 'start') issues.push(`${tag}: history does not begin with start`);
    const current = r.bankroll.current(s.id);
    if (current !== running) issues.push(`${tag}: current ${current} != ${running}`);
    // A closed session's final bankroll is the snapshot at its reset entry; archived open bets
    // may settle afterwards (FR-S6) and move only the running bankroll.
    const resets = history.filter((e) => e.reason === 'reset');
    if (s.status === 'closed') {
      if (resets.length !== 1) issues.push(`${tag}: closed with ${resets.length} reset entries`);
      else if (s.finalBankrollCents !== resets[0]!.bankrollCents) {
        issues.push(
          `${tag}: final bankroll ${s.finalBankrollCents} != ${resets[0]!.bankrollCents}`,
        );
      }
    } else if (resets.length > 0) issues.push(`${tag}: active session has a reset entry`);

    const byBet = new Map<string, number>();
    for (const e of history) {
      if (e.betId !== null) byBet.set(`${e.betId}|${e.reason}`, e.deltaCents);
    }
    for (const b of r.bets.listBySession(s.id)) {
      if (byBet.get(`${b.id}|stake`) !== -b.stakeCents) {
        issues.push(`${tag}: bet ${b.id} stake missing from history`);
      }
      const payout = byBet.get(`${b.id}|settle`);
      if (b.status === 'open' ? payout !== undefined : payout !== b.payoutCents) {
        issues.push(`${tag}: bet ${b.id} settlement does not match history`);
      }
    }
    const foreign = history.filter(
      (e) => e.betId !== null && r.bets.getById(e.betId)?.sessionId !== s.id,
    );
    for (const e of foreign) issues.push(`${tag}: entry ${e.id} belongs to another session's bet`);
  }
  return { ok: issues.length === 0, issues };
}

/** Throws with every issue listed; for dev builds and tests. */
export function assertConsistent(db: SqlDriver): void {
  const { ok, issues } = checkConsistency(db);
  if (!ok) throw new Error(`bankroll inconsistency:\n${issues.join('\n')}`);
}
