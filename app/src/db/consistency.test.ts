import { assertConsistent, checkConsistency } from './consistency';
import { repos } from './repos';
import { createSession, followAdvice, resetSession } from './services';
import { freezable, freshDb, utc } from './testUtils';

const NOW = new Date('2026-11-09T08:00:00Z');

/** A database with one frozen bet, and its triggers dropped so tests can corrupt it. */
function corruptible() {
  const db = freshDb();
  createSession(db, 100_00, NOW);
  const [bet] = followAdvice(db, [freezable()], NOW, utc).frozen;
  for (const t of [
    'bankroll_history_no_update',
    'bankroll_history_no_delete',
    'sessions_closed_frozen',
  ]) {
    db.exec(`DROP TRIGGER ${t}`);
  }
  return { db, betId: bet!.id };
}

it('passes on a healthy database', () => {
  const { db } = corruptible();
  expect(checkConsistency(db)).toEqual({ ok: true, issues: [] });
  expect(() => assertConsistent(db)).not.toThrow();
});

it('detects a wrong running bankroll', () => {
  const { db } = corruptible();
  db.run("UPDATE bankroll_history SET bankroll_cents = 1 WHERE reason = 'stake'");
  expect(checkConsistency(db).issues).toEqual(['session 1: entry 2 says 1, running sum is 9500']);
  expect(() => assertConsistent(db)).toThrow('bankroll inconsistency');
});

it('detects a stake missing from the history and a missing start entry', () => {
  const { db } = corruptible();
  db.run('DELETE FROM bankroll_history');
  expect(checkConsistency(db).issues).toEqual([
    'session 1: history does not begin with start',
    'session 1: bet 1 stake missing from history',
  ]);
});

it('detects a settle entry for an open bet', () => {
  const { db, betId } = corruptible();
  repos(db).bankroll.append({ sessionId: 1, at: 'x', deltaCents: 0, reason: 'settle', betId });
  expect(checkConsistency(db).issues).toEqual([
    'session 1: bet 1 settlement does not match history',
  ]);
});

it('detects history pointing at another session and a negative bankroll', () => {
  const { db, betId } = corruptible();
  resetSession(db, 50_00, NOW);
  db.run(
    `INSERT INTO bankroll_history (session_id, at, delta_cents, bankroll_cents, reason, bet_id)
     VALUES (2, 'x', -6000, 0, 'settle', ?)`,
    [betId],
  );
  expect(checkConsistency(db).issues).toEqual([
    'session 2: entry 5 says 0, running sum is -1000',
    'session 2: negative bankroll at entry 5',
    "session 2: entry 5 belongs to another session's bet",
  ]);
});

it('detects reset entries that do not match the session state', () => {
  const { db } = corruptible();
  resetSession(db, 50_00, NOW);
  db.run('UPDATE sessions SET final_bankroll_cents = 1 WHERE id = 1');
  repos(db).bankroll.append({ sessionId: 2, at: 'x', deltaCents: 0, reason: 'reset' });
  expect(checkConsistency(db).issues).toEqual([
    'session 2: active session has a reset entry',
    'session 1: final bankroll 1 != 9500',
  ]);
  db.run("DELETE FROM bankroll_history WHERE reason = 'reset'");
  expect(checkConsistency(db).issues).toEqual(['session 1: closed with 0 reset entries']);
});

it('detects more than one active session', () => {
  const { db } = corruptible();
  db.exec('DROP INDEX sessions_one_active');
  db.run(
    `INSERT INTO sessions (starting_budget_cents, started_at, status, settings_json)
     SELECT starting_budget_cents, started_at, status, settings_json FROM sessions`,
  );
  repos(db).bankroll.append({ sessionId: 2, at: 'x', deltaCents: 0, reason: 'start' });
  expect(checkConsistency(db).issues).toEqual(['2 active sessions']);
});
