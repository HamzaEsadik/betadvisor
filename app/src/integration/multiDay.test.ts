/**
 * Part 16: a multi-day run over the `feed-samples` sequence, end to end through the same pieces
 * the app uses (feed client + cache, `followAdvice`, `settleAndFlag`, `resetSession`), with an
 * in-memory database and a mocked clock. Every bankroll is checked against hand-computed values,
 * and the NFR-I2 consistency check runs after every step.
 *
 * Settings are the defaults (5% per bet, 15% per day, $1.00 minimum); the device zone is UTC.
 *
 * Day 1 (2026-11-09), budget $100.00, day-start bankroll 10000¢:
 *   BAY-BVB AWAY  0.010469 × 10000 = 104.69 → 105¢ @ 4.20
 *   ARS-CHE HOME  0.020909 × 10000 = 209.09 → 209¢ @ 2.10
 *   RMA-VAL HOME  0.015594 × 10000 = 155.94 → 156¢ @ 1.85
 *   frozen 470¢ (cap 1500¢) → bankroll 9530¢
 * Results: ARS-CHE 2-1 won (209 × 2.10 = 438.9 → 439¢), BAY-BVB 3-1 lost (0¢),
 *   RMA-VAL postponed, void (156¢ back) → 9530 + 439 + 156 = 10125¢
 * Day 2 (2026-11-10), day-start bankroll 10125¢:
 *   PSG-ASM HOME  0.027903 × 10125 = 282.52 → 283¢ @ 1.62 → bankroll 9842¢
 * Reset to $300.00: session 1 closes at 9842¢, session 2 starts at 30000¢.
 * Results: PSG-ASM 2-0 won (283 × 1.62 = 458.46 → 458¢) into the closed session:
 *   session 1 running bankroll 9842 + 458 = 10300¢ (final bankroll stays 9842¢); session 2 30000¢.
 */
import { fetchFeed, type FeedClientDeps, type FeedDocs, type FeedKind } from '../api';
import { BASE_URL, fakeServer, sample, scenario } from '../api/testServer';
import { settleAndFlag } from '../background/settle';
import { assertConsistent, createSession, followAdvice, repos, resetSession } from '../db';
import type { SqlDriver } from '../db/driver';
import { freshDb, utc } from '../db/testUtils';

const at = (iso: string) => new Date(iso);

describe('multi-day scenario over feed-samples', () => {
  let db: SqlDriver;
  let now: Date;
  let server: ReturnType<typeof fakeServer>;
  let deps: FeedClientDeps;

  const r = () => repos(db);
  const bankroll = (sessionId: number) => r().bankroll.current(sessionId);
  const bet = (sessionId: number, signalId: string) =>
    r()
      .bets.listBySession(sessionId)
      .find((b) => b.signalId === signalId)!;

  async function pull<K extends FeedKind>(kind: K): Promise<FeedDocs[K]> {
    const out = await fetchFeed(deps, kind);
    expect(out.status).toBe('updated');
    return out.doc!;
  }

  /** Each step leaves the database consistent (NFR-I2). */
  function step(label: string, fn: () => void | Promise<void>) {
    it(label, async () => {
      await fn();
      assertConsistent(db);
    });
  }

  beforeAll(() => {
    db = freshDb();
    server = fakeServer(scenario('day1-normal'));
    deps = { fetch: server.fetch, cache: repos(db).cache, baseUrl: BASE_URL, now: () => now };
  });

  let s1 = 0;
  let s2 = 0;

  step('day 1, 09:00: set up $100.00 and follow the advice', async () => {
    now = at('2026-11-09T09:00:00Z');
    s1 = createSession(db, 10_000, now).id;
    const signals = await pull('signals');
    const out = followAdvice(db, signals.signals, { deviceNow: now }, utc);

    expect(out.frozen.map((b) => [b.signalId, b.stakeCents])).toEqual([
      ['2026-11-09_BL1_BAY-BVB_1X2_AWAY', 105],
      ['2026-11-09_PL_ARS-CHE_1X2_HOME', 209],
      ['2026-11-09_PD_RMA-VAL_1X2_HOME', 156],
    ]);
    expect(out.plan.dailyCapCents).toBe(1500);
    expect(out.plan.totalStakeCents).toBe(470);
    expect(bankroll(s1)).toBe(9530);
  });

  step('day 1, 14:00: a newer signal version changes no frozen bet (AC-6)', async () => {
    now = at('2026-11-09T14:00:00Z');
    server.serve('signals', sample('versioned/signals.v2.json'));
    const signals = await pull('signals');
    const ars = signals.signals.find((s) => s.signal_id === '2026-11-09_PL_ARS-CHE_1X2_HOME')!;
    expect([ars.version, ars.odds]).toEqual([2, 2.25]);

    const out = followAdvice(db, signals.signals, { deviceNow: now }, utc);
    expect(out.frozen).toEqual([]);
    const frozen = bet(s1, ars.signal_id);
    expect([frozen.signalVersion, frozen.odds, frozen.stakeCents]).toEqual([1, 2.1, 209]);
    expect(bankroll(s1)).toBe(9530);
  });

  step('day 1, 23:45: results arrive and settle', async () => {
    now = at('2026-11-09T23:45:00Z');
    server.serve('results', sample('day1-results/results.json'));
    const results = await pull('results');
    const pass = settleAndFlag(db, results, now);

    expect(pass).toEqual({ settled: 3, flagged: 0, errors: [] });
    const status = (id: string) => {
      const b = bet(s1, id);
      return [b.status, b.payoutCents, b.profitCents];
    };
    expect(status('2026-11-09_PL_ARS-CHE_1X2_HOME')).toEqual(['won', 439, 230]);
    expect(status('2026-11-09_BL1_BAY-BVB_1X2_AWAY')).toEqual(['lost', 0, -105]);
    expect(status('2026-11-09_PD_RMA-VAL_1X2_HOME')).toEqual(['void', 156, 0]);
    expect(bankroll(s1)).toBe(10_125);
  });

  step('day 1, 23:50: the same results again change nothing (AC-5)', () => {
    now = at('2026-11-09T23:50:00Z');
    const pass = settleAndFlag(db, JSON.parse(sample('day1-results/results.json')), now);
    expect(pass).toEqual({ settled: 0, flagged: 0, errors: [] });
    expect(bankroll(s1)).toBe(10_125);
  });

  step('day 2, 09:00: follow with the new bankroll', async () => {
    now = at('2026-11-10T09:00:00Z');
    server.serve('signals', sample('day2-results/signals.json'));
    const signals = await pull('signals');
    const out = followAdvice(db, signals.signals, { deviceNow: now }, utc);

    expect(out.day).toBe('2026-11-10');
    expect(out.plan.dailyCapCents).toBe(1519); // 15% of 10125¢ = 1518.75
    expect(out.frozen.map((b) => [b.signalId, b.stakeCents, b.bankrollBeforeCents])).toEqual([
      ['2026-11-10_FL1_PSG-ASM_1X2_HOME', 283, 10_125],
    ]);
    expect(bankroll(s1)).toBe(9842);
  });

  step('day 2, 12:00: reset to $300.00 with the PSG bet still open (AC-4)', () => {
    now = at('2026-11-10T12:00:00Z');
    const out = resetSession(db, 30_000, now);
    s2 = out.created.id;

    expect(out.closed).toMatchObject({ id: s1, status: 'closed', finalBankrollCents: 9842 });
    expect(out.created).toMatchObject({ status: 'active', startingBudgetCents: 30_000 });
    expect(
      r()
        .sessions.list()
        .map((s) => s.id),
    ).toEqual(expect.arrayContaining([s1, s2]));
    expect(bankroll(s2)).toBe(30_000);
    expect(bet(s1, '2026-11-10_FL1_PSG-ASM_1X2_HOME').status).toBe('open');
  });

  step('day 2, 23:00: the old open bet settles into the archived session (FR-S6)', async () => {
    now = at('2026-11-10T23:00:00Z');
    server.serve('results', sample('day2-results/results.json'));
    const results = await pull('results');
    const pass = settleAndFlag(db, results, now);

    expect(pass).toEqual({ settled: 1, flagged: 0, errors: [] });
    const psg = bet(s1, '2026-11-10_FL1_PSG-ASM_1X2_HOME');
    expect([psg.status, psg.payoutCents, psg.profitCents]).toEqual(['won', 458, 175]);
    expect(bankroll(s1)).toBe(10_300);
    expect(r().sessions.getById(s1)!.finalBankrollCents).toBe(9842);
    expect(bankroll(s2)).toBe(30_000);
    expect(r().bets.listBySession(s2)).toEqual([]);
  });

  step('day 5: nothing is left open, so nothing is flagged for review (FR-R6)', () => {
    now = at('2026-11-13T23:00:00Z');
    expect(settleAndFlag(db, null, now)).toEqual({ settled: 0, flagged: 0, errors: [] });
    expect(r().bets.listOpen()).toEqual([]);
  });
});
