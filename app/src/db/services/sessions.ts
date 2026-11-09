/** Session services: FR-S1 to FR-S6. Each runs in one transaction (NFR-R2). */
import { assertCents } from '../../domain/money';
import {
  MAX_BUDGET_CENTS,
  MIN_BUDGET_CENTS,
  planReset,
  type ResetPlan,
} from '../../domain/session';
import { settingsAt, type ScheduledSettings } from '../../domain/settings';
import { DEFAULT_STAKE_SETTINGS, type StakeSettings } from '../../domain/types';
import type { SqlDriver } from '../driver';
import { repos, type SessionRecord } from '../repos';

function checkBudget(cents: number): void {
  assertCents(cents);
  if (cents < MIN_BUDGET_CENTS || cents > MAX_BUDGET_CENTS) {
    throw new RangeError(`budget out of range: ${cents}`);
  }
}

/** FR-S1, FR-S2: starts the one active session with a `start` bankroll entry. */
export function createSession(
  db: SqlDriver,
  startingBudgetCents: number,
  now: Date,
  settings: StakeSettings = DEFAULT_STAKE_SETTINGS,
  next: ScheduledSettings | null = null,
): SessionRecord {
  checkBudget(startingBudgetCents);
  return db.transaction(() => {
    const r = repos(db);
    if (r.sessions.getActive()) throw new Error('an active session already exists');
    const at = now.toISOString();
    const id = r.sessions.insert({ startingBudgetCents, startedAt: at, settings, next });
    r.bankroll.append({ sessionId: id, at, deltaCents: 0, reason: 'start' });
    return r.sessions.getById(id)!;
  });
}

export interface ResetOutcome {
  closed: SessionRecord;
  created: SessionRecord;
  plan: ResetPlan;
}

/** FR-S5: what the confirmation dialog shows, without changing anything. */
export function previewReset(db: SqlDriver, newBudgetCents: number, now: Date): ResetPlan {
  const r = repos(db);
  const active = r.sessions.getActive();
  if (!active) throw new Error('no active session');
  return planReset(
    active,
    r.bets.listBySession(active.id),
    r.bankroll.current(active.id),
    newBudgetCents,
    now,
  );
}

/**
 * FR-S3 to FR-S6: closes the active session (final bankroll and statistics stored, a `reset`
 * entry ends its history) and starts a new one. Nothing is deleted; open bets stay in the closed
 * session and still settle there. The new session keeps the old settings in force now, and a
 * change still scheduled for later, unless given new ones.
 */
export function resetSession(
  db: SqlDriver,
  newBudgetCents: number,
  now: Date,
  settings?: StakeSettings,
): ResetOutcome {
  checkBudget(newBudgetCents);
  return db.transaction(() => {
    const r = repos(db);
    const plan = previewReset(db, newBudgetCents, now);
    const { sessionId, endedAt, finalBankrollCents, stats } = plan.close;
    const old = r.sessions.getById(sessionId)!;
    r.bankroll.append({ sessionId, at: endedAt, deltaCents: 0, reason: 'reset' });
    r.sessions.close(sessionId, endedAt, finalBankrollCents, stats);
    const pending = old.nextSettings;
    const created =
      settings !== undefined
        ? createSession(db, newBudgetCents, now, settings)
        : createSession(
            db,
            newBudgetCents,
            now,
            settingsAt({ settings: old.settings, next: pending }, now),
            pending !== null && Date.parse(pending.from) > now.getTime() ? pending : null,
          );
    return { closed: r.sessions.getById(sessionId)!, created, plan };
  });
}
