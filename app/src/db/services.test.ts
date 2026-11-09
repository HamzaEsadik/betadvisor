import { assertConsistent } from './consistency';
import type { SqlDriver } from './driver';
import { repos } from './repos';
import {
  createSession,
  flagStaleBets,
  followAdvice,
  previewReset,
  resetSession,
  settleFromResults,
} from './services';
import { finished, freezable, freshDb, utc } from './testUtils';

const MORNING = new Date('2026-11-09T08:00:00Z');
const LATER = new Date('2026-11-09T23:00:00Z');
const NEXT_DAY = new Date('2026-11-10T08:00:00Z');
const MATCH = 'PL_20261109_ARS_CHE';

function started(budgetCents = 100_00) {
  const db = freshDb();
  const session = createSession(db, budgetCents, MORNING);
  return { db, r: repos(db), session };
}

const bankroll = (db: SqlDriver) => {
  const r = repos(db);
  return r.bankroll.current(r.sessions.getActive()!.id);
};

describe('createSession', () => {
  it('starts with the budget and a start entry', () => {
    const { db, r, session } = started(250_00);
    expect(bankroll(db)).toBe(250_00);
    expect(r.bankroll.listBySession(session.id)).toMatchObject([
      { reason: 'start', deltaCents: 0, bankrollCents: 250_00 },
    ]);
  });

  it('refuses a second active session and out-of-range budgets', () => {
    const { db } = started();
    expect(() => createSession(db, 50_00, MORNING)).toThrow('already exists');
    const empty = freshDb();
    expect(() => createSession(empty, 9_99, MORNING)).toThrow(RangeError);
    expect(() => createSession(empty, 1_000_000_01, MORNING)).toThrow(RangeError);
    expect(() => createSession(empty, 10.5, MORNING)).toThrow();
  });
});

describe('acceptance criteria', () => {
  it('AC-1: $100 and stake fraction 0.05 freezes a $5.00 bet', () => {
    const { db } = started();
    const out = followAdvice(db, [freezable({ stake_fraction: 0.05 })], MORNING, utc);
    expect(out.frozen).toHaveLength(1);
    expect(out.frozen[0]).toMatchObject({ stakeCents: 5_00, bankrollBeforeCents: 100_00 });
    expect(bankroll(db)).toBe(95_00);
  });

  it('AC-2: a win at 2.00 brings the bankroll to $105.00', () => {
    const { db } = started();
    followAdvice(db, [freezable({ odds: 2 })], MORNING, utc);
    const out = settleFromResults(db, [finished(MATCH, 2, 0)], LATER);
    expect(out.settled[0]).toMatchObject({ status: 'won', payoutCents: 10_00, profitCents: 5_00 });
    expect(bankroll(db)).toBe(105_00);
  });

  it('AC-3: a loss brings the bankroll to $95.00', () => {
    const { db } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    settleFromResults(db, [finished(MATCH, 0, 1)], LATER);
    expect(bankroll(db)).toBe(95_00);
  });

  it('AC-4: reset to $300 starts a new active session and keeps the old one', () => {
    const { db, r, session } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    const out = resetSession(db, 300_00, LATER);
    expect(out.created).toMatchObject({ status: 'active', startingBudgetCents: 300_00 });
    expect(bankroll(db)).toBe(300_00);
    expect(out.closed).toMatchObject({
      id: session.id,
      status: 'closed',
      endedAt: LATER.toISOString(),
      finalBankrollCents: 95_00,
      stats: { bets: 1, open: 1 },
    });
    expect(r.sessions.list().map((s) => [s.id, s.status])).toEqual([
      [out.created.id, 'active'],
      [session.id, 'closed'],
    ]);
    expect(r.bets.listBySession(session.id)).toHaveLength(1);
    expect(out.plan.confirmation).toEqual({
      currentBankrollCents: 95_00,
      openBets: 1,
      openStakeCents: 5_00,
    });
    assertConsistent(db);
  });

  it('AC-5: re-processing the same results leaves the bankroll unchanged', () => {
    const { db } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    const results = [finished(MATCH, 2, 0)];
    expect(settleFromResults(db, results, LATER).settled).toHaveLength(1);
    const after = bankroll(db);
    const again = settleFromResults(db, results, NEXT_DAY);
    expect(again).toEqual({ settled: [], errors: [] });
    expect(bankroll(db)).toBe(after);
    expect(repos(db).bets.listBySession(1)[0]?.settledAt).toBe(LATER.toISOString());
  });

  it('AC-6: a newer signal version does not change the frozen bet', () => {
    const { db, r } = started();
    const [bet] = followAdvice(db, [freezable()], MORNING, utc).frozen;
    const v2 = freezable({
      version: 2,
      odds: 3.5,
      model_prob: 0.7,
      stake_fraction: 0.04,
      edge: 0.3,
    });
    const out = followAdvice(db, [v2], new Date('2026-11-09T12:00:00Z'), utc);
    expect(out.frozen).toEqual([]);
    expect(r.bets.getById(bet!.id)).toEqual(bet);
    expect(r.bets.getById(bet!.id)).toMatchObject({
      signalVersion: 1,
      odds: 2,
      modelProb: 0.55,
      stakeCents: 5_00,
    });
  });

  it('AC-7: stakes of one day never exceed the daily cap, across several calls', () => {
    const { db } = started();
    const sig = (n: number, kickoff = '2026-11-09T20:00:00Z') =>
      freezable({
        signal_id: `S${n}`,
        match_id: `M${n}`,
        edge: 0.1 + n / 100,
        kickoff_at: kickoff,
      });
    const first = followAdvice(db, [sig(1), sig(2)], MORNING, utc);
    const noon = new Date('2026-11-09T12:00:00Z');
    const second = followAdvice(db, [sig(1), sig(2), sig(3), sig(4)], noon, utc);
    expect(first.frozen.length + second.frozen.length).toBe(3);
    expect(second.plan.totalStakeCents).toBe(15_00);
    expect(second.plan.dailyCapCents).toBe(15_00);
    expect(second.plan.skipped.map((s) => s.reason)).toEqual(['daily_cap_reached']);
  });
});

describe('followAdvice', () => {
  it('freezes only today; Tomorrow is read-only', () => {
    const { db } = started();
    const out = followAdvice(
      db,
      [
        freezable(),
        freezable({ signal_id: 'T', match_id: 'M2', kickoff_at: '2026-11-10T20:00:00Z' }),
      ],
      MORNING,
      utc,
    );
    expect(out.day).toBe('2026-11-09');
    expect(out.frozen.map((b) => b.signalId)).toEqual(['2026-11-09_PL_ARS-CHE_1X2_HOME']);
  });

  it('uses the local day of the device', () => {
    const { db } = started();
    const paris = () => -60;
    const out = followAdvice(db, [freezable({ kickoff_at: '2026-11-09T23:30:00Z' })], LATER, paris);
    expect(out.day).toBe('2026-11-10');
    expect(out.frozen).toHaveLength(1);
  });

  it('stakes from the bankroll at the start of the day', () => {
    const { db } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    settleFromResults(db, [finished(MATCH, 2, 0)], LATER); // bankroll 105
    const next = freezable({ signal_id: 'N', match_id: 'M2', kickoff_at: '2026-11-10T20:00:00Z' });
    const out = followAdvice(db, [next], NEXT_DAY, utc);
    expect(out.frozen[0]).toMatchObject({ stakeCents: 5_25, bankrollBeforeCents: 105_00 });
  });

  it('skips a kickoff that has passed, using feed time when the device clock is behind', () => {
    const { db } = started();
    const clock = { deviceNow: MORNING, feedGeneratedAt: '2026-11-09T21:00:00Z' };
    const out = followAdvice(db, [freezable()], clock, utc);
    expect(out.frozen).toEqual([]);
    expect(out.plan.skipped[0]?.reason).toBe('kickoff_passed');
  });

  it('freezes nothing when the bankroll is depleted', () => {
    const { db } = started(19_00);
    const out = followAdvice(db, [freezable()], MORNING, utc);
    expect(out.plan.depleted).toBe(true);
    expect(out.frozen).toEqual([]);
    expect(bankroll(db)).toBe(19_00);
  });

  it('needs an active session', () => {
    expect(() => followAdvice(freshDb(), [freezable()], MORNING, utc)).toThrow('no active session');
  });

  it('a crash mid-transaction rolls everything back (NFR-R2)', () => {
    const { db, r } = started();
    let inserts = 0;
    const crashing: SqlDriver = {
      ...db,
      run(sql, params) {
        if (sql.includes('INSERT INTO bankroll_history') && ++inserts === 2)
          throw new Error('power cut');
        return db.run(sql, params);
      },
    };
    const sigs = [freezable(), freezable({ signal_id: 'B', match_id: 'M2', edge: 0.05 })];
    expect(() => followAdvice(crashing, sigs, MORNING, utc)).toThrow('power cut');
    expect(r.bets.listOpen()).toEqual([]);
    expect(bankroll(db)).toBe(100_00);
    expect(r.bankroll.listBySession(1)).toHaveLength(1);
    expect(followAdvice(db, sigs, MORNING, utc).frozen).toHaveLength(2);
    assertConsistent(db);
  });
});

describe('settleFromResults', () => {
  it('voids postponed matches and returns the stake', () => {
    const { db } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    const out = settleFromResults(
      db,
      [
        {
          match_id: MATCH,
          status: 'POSTPONED',
          home_goals: null,
          away_goals: null,
          closing_odds: null,
        },
      ],
      LATER,
    );
    expect(out.settled[0]).toMatchObject({ status: 'void', payoutCents: 5_00, profitCents: 0 });
    expect(bankroll(db)).toBe(100_00);
  });

  it('stores closing odds and ignores results without bets', () => {
    const { db } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    const out = settleFromResults(
      db,
      [
        finished('OTHER', 1, 1),
        finished(MATCH, 1, 1, { closing_odds: { HOME: 1.9, DRAW: 3.4, AWAY: 4 } }),
      ],
      LATER,
    );
    expect(out.settled).toHaveLength(1);
    expect(out.settled[0]).toMatchObject({ status: 'lost', closingOdds: 1.9 });
  });

  it('settles an archived open bet without touching the new session (FR-S6)', () => {
    const { db, r, session } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    const { created } = resetSession(db, 300_00, LATER);
    const out = settleFromResults(db, [finished(MATCH, 3, 0)], NEXT_DAY);
    expect(out.settled[0]).toMatchObject({ sessionId: session.id, status: 'won' });
    expect(r.bankroll.current(created.id)).toBe(300_00);
    expect(r.bankroll.listBySession(created.id)).toHaveLength(1);
    expect(r.bankroll.current(session.id)).toBe(105_00);
    expect(r.sessions.getById(session.id)?.finalBankrollCents).toBe(95_00);
    assertConsistent(db);
  });

  it('reports a malformed result and still applies the others', () => {
    const { db, r } = started();
    followAdvice(
      db,
      [freezable(), freezable({ signal_id: 'B', match_id: 'M2', edge: 0.05 })],
      MORNING,
      utc,
    );
    const out = settleFromResults(
      db,
      [{ ...finished(MATCH, 0, 0), home_goals: null }, finished('M2', 0, 1)],
      LATER,
    );
    expect(out.errors).toEqual([
      { matchId: MATCH, message: `finished match without a score: ${MATCH}` },
    ]);
    expect(out.settled.map((b) => b.matchId)).toEqual(['M2']);
    expect(r.bets.listOpenByMatch(MATCH)).toHaveLength(1);
    assertConsistent(db);
  });
});

describe('flagStaleBets', () => {
  it('flags open bets 72 h after kickoff, once', () => {
    const { db, r } = started();
    const [bet] = followAdvice(db, [freezable()], MORNING, utc).frozen;
    expect(flagStaleBets(db, new Date('2026-11-12T19:59:00Z'))).toEqual([]);
    expect(flagStaleBets(db, new Date('2026-11-12T20:00:00Z'))).toEqual([bet!.id]);
    expect(flagStaleBets(db, new Date('2026-11-13T20:00:00Z'))).toEqual([]);
    settleFromResults(db, [finished(MATCH, 1, 0)], new Date('2026-11-14T00:00:00Z'));
    expect(r.bets.getById(bet!.id)?.reviewFlag).toBe(false);
  });
});

describe('resetSession', () => {
  it('needs an active session and a valid budget', () => {
    expect(() => resetSession(freshDb(), 300_00, LATER)).toThrow('no active session');
    expect(() => previewReset(freshDb(), 300_00, LATER)).toThrow('no active session');
    const { db } = started();
    expect(() => resetSession(db, 5_00, LATER)).toThrow(RangeError);
  });

  it('keeps the old settings unless new ones are given', () => {
    const custom = { perBetCap: 0.03, dailyCap: 0.1, minStakeCents: 200 };
    const db = freshDb();
    createSession(db, 100_00, MORNING, custom);
    expect(resetSession(db, 200_00, LATER).created.settings).toEqual(custom);
    const fresh = { ...custom, minStakeCents: 100 };
    expect(resetSession(db, 200_00, NEXT_DAY, fresh).created.settings).toEqual(fresh);
  });

  it('previewReset changes nothing', () => {
    const { db, r } = started();
    followAdvice(db, [freezable()], MORNING, utc);
    expect(previewReset(db, 300_00, LATER).confirmation.openBets).toBe(1);
    expect(r.sessions.list()).toHaveLength(1);
  });
});
