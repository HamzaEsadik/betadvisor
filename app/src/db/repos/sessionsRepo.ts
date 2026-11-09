import type { Summary } from '../../domain/metrics';
import { DEFAULT_STAKE_SETTINGS, type StakeSettings } from '../../domain/types';
import type { SqlDriver } from '../driver';

export type SessionStatus = 'active' | 'closed';

export interface SessionRecord {
  id: number;
  startingBudgetCents: number;
  startedAt: string;
  endedAt: string | null;
  finalBankrollCents: number | null;
  status: SessionStatus;
  /** Staking settings this session uses (fixed at creation). */
  settings: StakeSettings;
  /** Final statistics, stored when the session is closed (FR-S3). */
  stats: Summary | null;
}

interface SessionRow {
  id: number;
  starting_budget_cents: number;
  started_at: string;
  ended_at: string | null;
  final_bankroll_cents: number | null;
  status: SessionStatus;
  settings_json: string;
  stats_json: string | null;
}

/** Reads stored settings; a missing or malformed key fails loudly instead of using a default. */
export function parseStakeSettings(json: string): StakeSettings {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const out = {} as Record<keyof StakeSettings, number>;
  for (const key of Object.keys(DEFAULT_STAKE_SETTINGS) as (keyof StakeSettings)[]) {
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`session settings: bad ${key}: ${String(v)}`);
    }
    out[key] = v;
  }
  return out;
}

function toRecord(r: SessionRow): SessionRecord {
  return {
    id: r.id,
    startingBudgetCents: r.starting_budget_cents,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    finalBankrollCents: r.final_bankroll_cents,
    status: r.status,
    settings: parseStakeSettings(r.settings_json),
    stats: r.stats_json === null ? null : (JSON.parse(r.stats_json) as Summary),
  };
}

export interface NewSession {
  startingBudgetCents: number;
  startedAt: string;
  settings: StakeSettings;
}

export function sessionsRepo(db: SqlDriver) {
  return {
    insert(s: NewSession): number {
      return db.run(
        `INSERT INTO sessions (starting_budget_cents, started_at, status, settings_json)
         VALUES (?, ?, 'active', ?)`,
        [s.startingBudgetCents, s.startedAt, JSON.stringify(s.settings)],
      ).lastInsertRowId;
    },

    getById(id: number): SessionRecord | undefined {
      const row = db.get<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
      return row && toRecord(row);
    },

    getActive(): SessionRecord | undefined {
      const row = db.get<SessionRow>("SELECT * FROM sessions WHERE status = 'active'");
      return row && toRecord(row);
    },

    /** Newest first (FR-S7). */
    list(): SessionRecord[] {
      return db.all<SessionRow>('SELECT * FROM sessions ORDER BY id DESC').map(toRecord);
    },

    close(id: number, endedAt: string, finalBankrollCents: number, stats: Summary): void {
      const r = db.run(
        `UPDATE sessions
         SET status = 'closed', ended_at = ?, final_bankroll_cents = ?, stats_json = ?
         WHERE id = ? AND status = 'active'`,
        [endedAt, finalBankrollCents, JSON.stringify(stats), id],
      );
      if (r.changes !== 1) throw new Error(`session ${id} is not active`);
    },
  };
}

export type SessionsRepo = ReturnType<typeof sessionsRepo>;
