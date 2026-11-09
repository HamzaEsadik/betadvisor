import { DEFAULT_STAKE_SETTINGS } from '../domain/types';
import { parseStakeSettings, repos, type NewBet } from './repos';
import { createSession } from './services';
import { freshDb } from './testUtils';

const NOW = new Date('2026-11-09T08:00:00Z');

function setup() {
  const db = freshDb();
  const r = repos(db);
  const session = createSession(db, 100_00, NOW);
  const newBet = (over: Partial<NewBet> = {}): NewBet => ({
    sessionId: session.id,
    signalId: '2026-11-09_PL_ARS-CHE_1X2_HOME',
    signalVersion: 1,
    matchId: 'PL_20261109_ARS_CHE',
    league: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffAt: '2026-11-09T20:00:00Z',
    market: '1X2',
    selection: 'HOME',
    odds: 2.1,
    modelProb: 0.52,
    impliedProb: 0.46,
    edge: 0.092,
    stakeFraction: 0.0209,
    stakeCents: 209,
    bankrollBeforeCents: 100_00,
    createdAt: NOW.toISOString(),
    ...over,
  });
  return { db, r, session, newBet };
}

describe('sessionsRepo', () => {
  it('stores the session with its settings', () => {
    const { r, session } = setup();
    expect(session).toMatchObject({
      startingBudgetCents: 100_00,
      status: 'active',
      endedAt: null,
      finalBankrollCents: null,
      stats: null,
      settings: DEFAULT_STAKE_SETTINGS,
    });
    expect(r.sessions.getActive()?.id).toBe(session.id);
    expect(r.sessions.getById(999)).toBeUndefined();
  });

  it('allows only one active session (FR-S2)', () => {
    const { r } = setup();
    expect(() =>
      r.sessions.insert({
        startingBudgetCents: 50_00,
        startedAt: 'x',
        settings: DEFAULT_STAKE_SETTINGS,
      }),
    ).toThrow(/UNIQUE/);
  });

  it('refuses to close a session twice, and a closed session never changes', () => {
    const { db, r, session } = setup();
    const stats = { bets: 0 } as never;
    r.sessions.close(session.id, NOW.toISOString(), 100_00, stats);
    expect(r.sessions.getActive()).toBeUndefined();
    expect(() => r.sessions.close(session.id, NOW.toISOString(), 1, stats)).toThrow('not active');
    expect(() => db.run('UPDATE sessions SET final_bankroll_cents = 1')).toThrow('closed');
    expect(() => db.run('DELETE FROM sessions')).toThrow('cannot be deleted');
  });

  it('refuses to change an active session starting budget', () => {
    const { db } = setup();
    expect(() => db.run('UPDATE sessions SET starting_budget_cents = 5')).toThrow('immutable');
  });

  it('fails loudly on malformed settings', () => {
    expect(parseStakeSettings('{"perBetCap":0.05,"dailyCap":0.15,"minStakeCents":100}')).toEqual(
      DEFAULT_STAKE_SETTINGS,
    );
    expect(() => parseStakeSettings('{"perBetCap":0.05,"dailyCap":0.15}')).toThrow('minStakeCents');
    expect(() => parseStakeSettings('{"perBetCap":"x","dailyCap":1,"minStakeCents":1}')).toThrow(
      'perBetCap',
    );
  });
});

describe('betsRepo and triggers (NFR-I1)', () => {
  it('inserts and reads back a frozen bet with every FR-B2 field', () => {
    const { r, newBet } = setup();
    const id = r.bets.insert(newBet());
    expect(r.bets.getById(id)).toEqual({
      id,
      ...newBet(),
      status: 'open',
      settledAt: null,
      payoutCents: null,
      profitCents: null,
      closingOdds: null,
      reviewFlag: false,
    });
    expect(r.bets.getById(999)).toBeUndefined();
  });

  it('refuses the same signal twice in a session (FR-B4)', () => {
    const { r, newBet } = setup();
    r.bets.insert(newBet());
    expect(() => r.bets.insert(newBet({ signalVersion: 2 }))).toThrow(/UNIQUE/);
  });

  it.each([
    ['odds', '3.0'],
    ['stake_cents', '1'],
    ['model_prob', '0.9'],
    ['signal_id', "'other'"],
    ['session_id', '2'],
    ['kickoff_at', "'2026-12-01T00:00:00Z'"],
  ])('an UPDATE of %s throws', (column, value) => {
    const { db, r, newBet } = setup();
    const id = r.bets.insert(newBet());
    const sql = `UPDATE bets SET ${column} = ${value} WHERE id = ?`;
    expect(() => db.run(sql, [id])).toThrow('frozen bet fields are immutable');
  });

  it('a DELETE throws', () => {
    const { db, r, newBet } = setup();
    const id = r.bets.insert(newBet());
    expect(() => db.run('DELETE FROM bets WHERE id = ?', [id])).toThrow('cannot be deleted');
    expect(r.bets.getById(id)).toBeDefined();
  });

  it('settlement fields may change once, then never again', () => {
    const { db, r, newBet } = setup();
    const id = r.bets.insert(newBet());
    const won = { status: 'won', payoutCents: 439, profitCents: 230, closingOdds: 1.95 } as const;
    expect(r.bets.settle(id, won, NOW.toISOString())).toBe(true);
    expect(r.bets.settle(id, won, NOW.toISOString())).toBe(false);
    expect(r.bets.getById(id)).toMatchObject({
      status: 'won',
      payoutCents: 439,
      closingOdds: 1.95,
    });
    expect(() => db.run("UPDATE bets SET status = 'lost', payout_cents = 0")).toThrow(
      'already settled',
    );
    db.run('UPDATE bets SET closing_odds = 2.0');
    expect(r.bets.getById(id)?.closingOdds).toBe(2);
  });

  it('an open bet cannot carry a payout', () => {
    const { db, r, newBet } = setup();
    r.bets.insert(newBet());
    expect(() => db.run('UPDATE bets SET payout_cents = 5')).toThrow(/CHECK/);
  });

  it('lists by session, open bets and open bets of a match', () => {
    const { r, newBet } = setup();
    const a = r.bets.insert(newBet({ kickoffAt: '2026-11-09T21:00:00Z' }));
    const b = r.bets.insert(
      newBet({ signalId: 'b', matchId: 'M2', kickoffAt: '2026-11-09T18:00:00Z' }),
    );
    expect(r.bets.listBySession(r.sessions.getActive()!.id).map((x) => x.id)).toEqual([b, a]);
    r.bets.settle(b, { status: 'void', payoutCents: 209, profitCents: 0, closingOdds: null }, 'x');
    expect(r.bets.listOpen().map((x) => x.id)).toEqual([a]);
    expect(r.bets.listOpenByMatch('M2')).toEqual([]);
    expect(r.bets.listOpenByMatch('PL_20261109_ARS_CHE').map((x) => x.id)).toEqual([a]);
  });

  it('sets the review flag only when it changes', () => {
    const { r, newBet } = setup();
    const id = r.bets.insert(newBet());
    expect(r.bets.setReviewFlag(id, true)).toBe(true);
    expect(r.bets.setReviewFlag(id, true)).toBe(false);
    expect(r.bets.getById(id)?.reviewFlag).toBe(true);
    expect(r.bets.setReviewFlag(id, false)).toBe(true);
  });
});

describe('bankrollRepo', () => {
  it('keeps a running bankroll and an append-only history', () => {
    const { db, r, session, newBet } = setup();
    const betId = r.bets.insert(newBet());
    expect(
      r.bankroll.append({
        sessionId: session.id,
        at: 't1',
        deltaCents: -209,
        reason: 'stake',
        betId,
      }),
    ).toBe(9791);
    expect(r.bankroll.current(session.id)).toBe(9791);
    expect(
      r.bankroll.listBySession(session.id).map((e) => [e.reason, e.deltaCents, e.bankrollCents]),
    ).toEqual([
      ['start', 0, 100_00],
      ['stake', -209, 9791],
    ]);
    expect(() => db.run('UPDATE bankroll_history SET delta_cents = 0')).toThrow('append-only');
    expect(() => db.run('DELETE FROM bankroll_history')).toThrow('append-only');
    expect(() =>
      r.bankroll.append({
        sessionId: session.id,
        at: 't2',
        deltaCents: -209,
        reason: 'stake',
        betId,
      }),
    ).toThrow(/UNIQUE/);
    expect(() =>
      r.bankroll.append({ sessionId: session.id, at: 't2', deltaCents: -1, reason: 'stake' }),
    ).toThrow(/CHECK/);
    expect(() =>
      r.bankroll.append({ sessionId: session.id, at: 't2', deltaCents: -1e6, reason: 'reset' }),
    ).toThrow(/CHECK/);
  });

  it('reads the bankroll at the start of a day', () => {
    const { r, session } = setup();
    expect(r.bankroll.atDayStart(session.id, '2026-11-09T00:00:00.000Z')).toBe(100_00);
    r.bankroll.append({
      sessionId: session.id,
      at: '2026-11-09T09:00:00.000Z',
      deltaCents: 0,
      reason: 'reset',
    });
    expect(r.bankroll.atDayStart(session.id, '2026-11-10T00:00:00.000Z')).toBe(100_00);
  });

  it('throws for an unknown session', () => {
    const { r } = setup();
    expect(() => r.bankroll.current(42)).toThrow('no session 42');
    expect(() => r.bankroll.atDayStart(42, 'x')).toThrow('no session 42');
  });
});

describe('cacheRepo', () => {
  it('upserts entries and touches the fetch time', () => {
    const { r } = setup();
    expect(r.cache.get('signals')).toBeUndefined();
    expect(r.cache.touch('signals', 't0')).toBe(false);
    r.cache.put({ key: 'signals', fetchedAt: 't1', etag: '"a"', payload: '{}' });
    r.cache.put({ key: 'signals', fetchedAt: 't2', etag: '"b"', payload: '{"x":1}' });
    expect(r.cache.get('signals')).toEqual({
      key: 'signals',
      fetchedAt: 't2',
      etag: '"b"',
      payload: '{"x":1}',
    });
    expect(r.cache.touch('signals', 't3')).toBe(true);
    expect(r.cache.get('signals')?.fetchedAt).toBe('t3');
  });

  it('accepts only the three feed keys', () => {
    const { r } = setup();
    expect(() =>
      r.cache.put({ key: 'other' as never, fetchedAt: 't', etag: null, payload: '' }),
    ).toThrow(/CHECK/);
  });
});

describe('settingsRepo', () => {
  it('stores JSON values', () => {
    const { r } = setup();
    expect(r.settings.get('theme')).toBeUndefined();
    r.settings.set('theme', 'dark');
    r.settings.set('reminder', { hour: 9, minute: 0 });
    r.settings.set('theme', 'light');
    expect(r.settings.get<string>('theme')).toBe('light');
    expect(r.settings.all()).toEqual({ theme: 'light', reminder: { hour: 9, minute: 0 } });
    r.settings.remove('theme');
    expect(r.settings.get('theme')).toBeUndefined();
    expect(() => r.settings.set('bad', undefined)).toThrow('not JSON');
  });
});
