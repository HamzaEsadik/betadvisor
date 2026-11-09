/**
 * Initial schema: SRS §5.1 with money as integer cents (`*_cents`), plus `review_flag` (FR-R6),
 * a key/value `settings` table, an ETag on `cache`, and triggers that make the ledger append-only.
 */
import type { Migration } from './types';

const IMMUTABLE_BET_COLUMNS = [
  'id',
  'session_id',
  'signal_id',
  'signal_version',
  'match_id',
  'league',
  'home_team',
  'away_team',
  'kickoff_at',
  'market',
  'selection',
  'odds',
  'model_prob',
  'implied_prob',
  'edge',
  'stake_fraction',
  'stake_cents',
  'bankroll_before_cents',
  'created_at',
];

const changed = (cols: readonly string[]) =>
  cols.map((c) => `NEW.${c} IS NOT OLD.${c}`).join('\n      OR ');

export const migration001: Migration = {
  version: 1,
  name: 'init',
  sql: `
CREATE TABLE sessions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  starting_budget_cents INTEGER NOT NULL CHECK (starting_budget_cents > 0),
  started_at            TEXT    NOT NULL,
  ended_at              TEXT,
  final_bankroll_cents  INTEGER,
  status                TEXT    NOT NULL CHECK (status IN ('active', 'closed')),
  settings_json         TEXT    NOT NULL,
  stats_json            TEXT,
  CHECK ((status = 'active') = (ended_at IS NULL)),
  CHECK ((status = 'active') = (final_bankroll_cents IS NULL))
);

-- FR-S2: exactly one active session.
CREATE UNIQUE INDEX sessions_one_active ON sessions (status) WHERE status = 'active';

CREATE TABLE bets (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id            INTEGER NOT NULL REFERENCES sessions (id),
  signal_id             TEXT    NOT NULL,
  signal_version        INTEGER NOT NULL CHECK (signal_version >= 1),
  match_id              TEXT    NOT NULL,
  league                TEXT    NOT NULL,
  home_team             TEXT    NOT NULL,
  away_team             TEXT    NOT NULL,
  kickoff_at            TEXT    NOT NULL,
  market                TEXT    NOT NULL CHECK (market IN ('1X2')),
  selection             TEXT    NOT NULL CHECK (selection IN ('HOME', 'DRAW', 'AWAY')),
  odds                  REAL    NOT NULL CHECK (odds > 1),
  model_prob            REAL    NOT NULL,
  implied_prob          REAL    NOT NULL,
  edge                  REAL    NOT NULL,
  stake_fraction        REAL    NOT NULL,
  stake_cents           INTEGER NOT NULL CHECK (stake_cents > 0),
  bankroll_before_cents INTEGER NOT NULL,
  created_at            TEXT    NOT NULL,
  status                TEXT    NOT NULL CHECK (status IN ('open', 'won', 'lost', 'void')),
  settled_at            TEXT,
  payout_cents          INTEGER,
  profit_cents          INTEGER,
  closing_odds          REAL,
  review_flag           INTEGER NOT NULL DEFAULT 0 CHECK (review_flag IN (0, 1)),
  CHECK ((status = 'open') = (settled_at IS NULL)),
  CHECK ((status = 'open') = (payout_cents IS NULL)),
  CHECK ((status = 'open') = (profit_cents IS NULL)),
  UNIQUE (session_id, signal_id)
);

CREATE INDEX bets_session_kickoff ON bets (session_id, kickoff_at);
CREATE INDEX bets_match ON bets (match_id);

-- NFR-I1, FR-B3: only settlement fields may change.
CREATE TRIGGER bets_frozen_fields BEFORE UPDATE ON bets
WHEN ${changed(IMMUTABLE_BET_COLUMNS)}
BEGIN
  SELECT RAISE(ABORT, 'frozen bet fields are immutable');
END;

-- FR-R5: a settled bet is never settled again.
CREATE TRIGGER bets_settled_once BEFORE UPDATE ON bets
WHEN OLD.status <> 'open' AND (${changed(['status', 'settled_at', 'payout_cents', 'profit_cents'])})
BEGIN
  SELECT RAISE(ABORT, 'bet is already settled');
END;

-- FR-S4: bets are never deleted.
CREATE TRIGGER bets_no_delete BEFORE DELETE ON bets
BEGIN
  SELECT RAISE(ABORT, 'bets cannot be deleted');
END;

CREATE TABLE bankroll_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions (id),
  at             TEXT    NOT NULL,
  delta_cents    INTEGER NOT NULL,
  bankroll_cents INTEGER NOT NULL CHECK (bankroll_cents >= 0),
  reason         TEXT    NOT NULL CHECK (reason IN ('start', 'stake', 'settle', 'reset')),
  bet_id         INTEGER REFERENCES bets (id),
  CHECK ((reason IN ('stake', 'settle')) = (bet_id IS NOT NULL))
);

CREATE INDEX bankroll_history_session ON bankroll_history (session_id, id);
-- One stake entry and one settle entry per bet at most (FR-R5).
CREATE UNIQUE INDEX bankroll_history_bet_reason ON bankroll_history (bet_id, reason)
  WHERE bet_id IS NOT NULL;

-- NFR-I2: the history is append-only.
CREATE TRIGGER bankroll_history_no_update BEFORE UPDATE ON bankroll_history
BEGIN
  SELECT RAISE(ABORT, 'bankroll history is append-only');
END;
CREATE TRIGGER bankroll_history_no_delete BEFORE DELETE ON bankroll_history
BEGIN
  SELECT RAISE(ABORT, 'bankroll history is append-only');
END;

-- FR-S4: sessions are never deleted, and a closed session never changes.
CREATE TRIGGER sessions_no_delete BEFORE DELETE ON sessions
BEGIN
  SELECT RAISE(ABORT, 'sessions cannot be deleted');
END;
CREATE TRIGGER sessions_closed_frozen BEFORE UPDATE ON sessions
WHEN OLD.status = 'closed'
  OR ${changed(['id', 'starting_budget_cents', 'started_at', 'settings_json'])}
BEGIN
  SELECT RAISE(ABORT, 'session is closed or field is immutable');
END;

CREATE TABLE cache (
  key        TEXT PRIMARY KEY CHECK (key IN ('signals', 'results', 'meta')),
  fetched_at TEXT NOT NULL,
  etag       TEXT,
  payload    TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
};
