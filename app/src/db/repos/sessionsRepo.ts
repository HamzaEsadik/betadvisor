import type { Summary } from '../../domain/metrics';
import type { ScheduledSettings, SessionSettings } from '../../domain/settings';
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
  /** Staking settings in force until `nextSettings.from` (design 07). */
  settings: StakeSettings;
  /** A change made in Settings, applying from the start of the next local day. */
  nextSettings: ScheduledSettings | null;
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
  return stakeSettingsOf(JSON.parse(json) as Record<string, unknown>);
}

function stakeSettingsOf(raw: Record<string, unknown>): StakeSettings {
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

/**
 * `settings_json` is the current settings object, optionally with a `next` key holding a scheduled
 * change `{ from, perBetCap, dailyCap, minStakeCents }`.
 */
export function parseSessionSettings(json: string): SessionSettings {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const settings = stakeSettingsOf(raw);
  if (raw.next === undefined || raw.next === null) return { settings, next: null };
  const next = raw.next as Record<string, unknown>;
  if (typeof next.from !== 'string' || Number.isNaN(Date.parse(next.from))) {
    throw new Error(`session settings: bad next.from: ${String(next.from)}`);
  }
  return { settings, next: { from: next.from, settings: stakeSettingsOf(next) } };
}

export function serializeSessionSettings(s: SessionSettings): string {
  return JSON.stringify(
    s.next === null
      ? s.settings
      : { ...s.settings, next: { from: s.next.from, ...s.next.settings } },
  );
}

function toRecord(r: SessionRow): SessionRecord {
  const { settings, next } = parseSessionSettings(r.settings_json);
  return {
    id: r.id,
    startingBudgetCents: r.starting_budget_cents,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    finalBankrollCents: r.final_bankroll_cents,
    status: r.status,
    settings,
    nextSettings: next,
    stats: r.stats_json === null ? null : (JSON.parse(r.stats_json) as Summary),
  };
}

export interface NewSession {
  startingBudgetCents: number;
  startedAt: string;
  settings: StakeSettings;
  next?: ScheduledSettings | null;
}

export function sessionsRepo(db: SqlDriver) {
  return {
    insert(s: NewSession): number {
      return db.run(
        `INSERT INTO sessions (starting_budget_cents, started_at, status, settings_json)
         VALUES (?, ?, 'active', ?)`,
        [
          s.startingBudgetCents,
          s.startedAt,
          serializeSessionSettings({ settings: s.settings, next: s.next ?? null }),
        ],
      ).lastInsertRowId;
    },

    /** Replaces the settings of the active session (closed sessions are immutable). */
    updateSettings(id: number, settings: SessionSettings): void {
      const r = db.run("UPDATE sessions SET settings_json = ? WHERE id = ? AND status = 'active'", [
        serializeSessionSettings(settings),
        id,
      ]);
      if (r.changes !== 1) throw new Error(`session ${id} is not active`);
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
