/** Design 07: staking settings changed mid-session apply from the next local day. */
import { migrate } from './migrate';
import { migration001 } from './migrations/001_init';
import { parseSessionSettings, repos } from './repos';
import { createSession, followAdvice, resetSession, scheduleStakeSettings } from './services';
import { openTestDriver } from './testDriver';
import { freezable, freshDb, utc } from './testUtils';
import { DEFAULT_STAKE_SETTINGS, type StakeSettings } from '../domain/types';

const MORNING = new Date('2026-11-09T08:00:00Z');
const TIGHT: StakeSettings = { perBetCap: 0.02, dailyCap: 0.04, minStakeCents: 100 };

describe('scheduleStakeSettings', () => {
  it('stores the change with the next local midnight as its start', () => {
    const db = freshDb();
    createSession(db, 100_00, MORNING);
    const s = scheduleStakeSettings(db, TIGHT, MORNING, utc);
    expect(s.settings).toEqual(DEFAULT_STAKE_SETTINGS);
    expect(s.nextSettings).toEqual({ from: '2026-11-10T00:00:00.000Z', settings: TIGHT });
    // UTC+2: the local day ends at 22:00 UTC.
    const plus2 = scheduleStakeSettings(db, TIGHT, MORNING, () => -120);
    expect(plus2.nextSettings?.from).toBe('2026-11-09T22:00:00.000Z');
    expect(() => scheduleStakeSettings(freshDb(), TIGHT, MORNING)).toThrow('no active session');
  });

  it('leaves today and frozen bets alone and applies from tomorrow (AC-6)', () => {
    const db = freshDb();
    const r = repos(db);
    createSession(db, 100_00, MORNING);
    const today = freezable({ kickoff_at: '2026-11-09T20:00:00Z' });
    const [bet] = followAdvice(db, [today], MORNING, utc).frozen;
    scheduleStakeSettings(db, TIGHT, MORNING, utc);

    expect(r.bets.getById(bet!.id)).toEqual(bet);
    // A second signal today still uses today's 5% cap.
    const second = freezable({
      signal_id: 'x2',
      match_id: 'M2',
      kickoff_at: '2026-11-09T21:00:00Z',
    });
    const out = followAdvice(db, [today, second], MORNING, utc);
    expect(out.frozen.map((b) => b.signalId)).toEqual(['x2']);
    expect(out.frozen[0]!.stakeCents).toBe(bet!.stakeCents);

    // Tomorrow the 2% per-bet cap applies.
    const next = freezable({ signal_id: 'x3', match_id: 'M3', kickoff_at: '2026-11-10T20:00:00Z' });
    const t = followAdvice(db, [next], new Date('2026-11-10T08:00:00Z'), utc);
    expect(t.frozen[0]!.stakeCents / t.frozen[0]!.bankrollBeforeCents).toBeLessThanOrEqual(0.0201);
  });

  it('FR-B5: freezes only the chosen signals with the planned stakes', () => {
    const db = freshDb();
    createSession(db, 100_00, MORNING);
    const a = freezable({ kickoff_at: '2026-11-09T20:00:00Z' });
    const b = freezable({ signal_id: 'b', match_id: 'MB', kickoff_at: '2026-11-09T21:00:00Z' });
    const out = followAdvice(db, [a, b], MORNING, utc, { only: new Set(['b']) });
    expect(out.frozen.map((x) => x.signalId)).toEqual(['b']);
    expect(out.frozen[0]!.stakeCents).toBe(out.plan.toFollow[1]!.stakeCents);
  });

  it('a reset carries the settings in force and a change still to come', () => {
    const db = freshDb();
    createSession(db, 100_00, MORNING);
    scheduleStakeSettings(db, TIGHT, MORNING, utc);
    const same = resetSession(db, 50_00, new Date('2026-11-09T09:00:00Z')).created;
    expect(same.settings).toEqual(DEFAULT_STAKE_SETTINGS);
    expect(same.nextSettings?.settings).toEqual(TIGHT);
    const later = resetSession(db, 50_00, new Date('2026-11-10T09:00:00Z')).created;
    expect(later.settings).toEqual(TIGHT);
    expect(later.nextSettings).toBeNull();
  });

  it('closed sessions stay immutable', () => {
    const db = freshDb();
    const r = repos(db);
    const s = createSession(db, 100_00, MORNING);
    resetSession(db, 50_00, MORNING);
    expect(() => r.sessions.updateSettings(s.id, { settings: TIGHT, next: null })).toThrow(
      'not active',
    );
    expect(() => db.run("UPDATE sessions SET settings_json = '{}' WHERE id = ?", [s.id])).toThrow(
      'closed',
    );
  });
});

describe('settings_json', () => {
  it('fails loudly on a malformed scheduled change', () => {
    const base = '"perBetCap":0.05,"dailyCap":0.15,"minStakeCents":100';
    expect(parseSessionSettings(`{${base},"next":null}`).next).toBeNull();
    expect(() => parseSessionSettings(`{${base},"next":{"from":"nope"}}`)).toThrow('next.from');
    expect(() =>
      parseSessionSettings(`{${base},"next":{"from":"2026-11-10T00:00:00Z","dailyCap":0.1}}`),
    ).toThrow('perBetCap');
  });

  it('migration 2 keeps existing sessions and lets the active one change settings', () => {
    const db = openTestDriver();
    migrate(db, [migration001]);
    createSession(db, 100_00, MORNING);
    expect(() => db.run('UPDATE sessions SET settings_json = settings_json')).not.toThrow();
    expect(() => db.run("UPDATE sessions SET settings_json = '{}'")).toThrow('immutable');
    expect(migrate(db)).toEqual([2]);
    const r = repos(db);
    const s = r.sessions.getActive()!;
    expect(s.settings).toEqual(DEFAULT_STAKE_SETTINGS);
    r.sessions.updateSettings(s.id, { settings: TIGHT, next: null });
    expect(r.sessions.getActive()!.settings).toEqual(TIGHT);
    expect(() => db.run('UPDATE sessions SET started_at = 1')).toThrow('immutable');
  });
});
