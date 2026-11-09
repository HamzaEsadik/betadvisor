import type { SqlDriver } from '../driver';

export type BankrollReason = 'start' | 'stake' | 'settle' | 'reset';

export interface BankrollEntry {
  id: number;
  sessionId: number;
  at: string;
  deltaCents: number;
  /** Bankroll after this entry. */
  bankrollCents: number;
  reason: BankrollReason;
  betId: number | null;
}

interface EntryRow {
  id: number;
  session_id: number;
  at: string;
  delta_cents: number;
  bankroll_cents: number;
  reason: BankrollReason;
  bet_id: number | null;
}

const toEntry = (r: EntryRow): BankrollEntry => ({
  id: r.id,
  sessionId: r.session_id,
  at: r.at,
  deltaCents: r.delta_cents,
  bankrollCents: r.bankroll_cents,
  reason: r.reason,
  betId: r.bet_id,
});

export interface NewEntry {
  sessionId: number;
  at: string;
  deltaCents: number;
  reason: BankrollReason;
  betId?: number | null;
}

/** Bankroll = starting budget + Σ deltas (Key decisions, NFR-I2). */
export function bankrollRepo(db: SqlDriver) {
  const current = (sessionId: number): number => {
    const row = db.get<{ budget: number | null; deltas: number | null }>(
      `SELECT s.starting_budget_cents AS budget,
              (SELECT SUM(delta_cents) FROM bankroll_history WHERE session_id = s.id) AS deltas
       FROM sessions s WHERE s.id = ?`,
      [sessionId],
    );
    if (!row || row.budget === null) throw new Error(`no session ${sessionId}`);
    return row.budget + (row.deltas ?? 0);
  };

  return {
    current,

    /** Appends an entry and returns the bankroll after it. */
    append(e: NewEntry): number {
      const after = current(e.sessionId) + e.deltaCents;
      db.run(
        `INSERT INTO bankroll_history (session_id, at, delta_cents, bankroll_cents, reason, bet_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [e.sessionId, e.at, e.deltaCents, after, e.reason, e.betId ?? null],
      );
      return after;
    },

    /**
     * Bankroll at the start of a local day (FR-A5, Key decisions): the last entry before
     * `dayStartIso`; a session that started that day has its starting budget.
     */
    atDayStart(sessionId: number, dayStartIso: string): number {
      const row = db.get<{ bankroll_cents: number }>(
        `SELECT bankroll_cents FROM bankroll_history
         WHERE session_id = ? AND at < ? ORDER BY id DESC LIMIT 1`,
        [sessionId, dayStartIso],
      );
      if (row) return row.bankroll_cents;
      const s = db.get<{ starting_budget_cents: number }>(
        'SELECT starting_budget_cents FROM sessions WHERE id = ?',
        [sessionId],
      );
      if (!s) throw new Error(`no session ${sessionId}`);
      return s.starting_budget_cents;
    },

    listBySession(sessionId: number): BankrollEntry[] {
      return db
        .all<EntryRow>('SELECT * FROM bankroll_history WHERE session_id = ? ORDER BY id', [
          sessionId,
        ])
        .map(toEntry);
    },
  };
}

export type BankrollRepo = ReturnType<typeof bankrollRepo>;
