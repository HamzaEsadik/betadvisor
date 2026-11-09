/**
 * Seeded property test: a random sequence of 200 operations (follow, settle, re-settle, reset,
 * flag, clock moves) must keep the bankroll consistent after every step (NFR-I2), never settle
 * twice (FR-R5), never change a frozen bet (NFR-I1) and keep each day under its cap (AC-7).
 */
import { dayKeyOf, dayStartUtc } from '../domain/day';
import { mulberry32 } from '../domain/metrics';
import { dailyCapCents } from '../domain/stakes';
import type { MatchResult, Selection } from '../domain/types';
import { checkConsistency } from './consistency';
import { repos, type BetRecord } from './repos';
import type { FreezableSignal } from './services';
import {
  createSession,
  flagStaleBets,
  followAdvice,
  resetSession,
  settleFromResults,
} from './services';
import { freezable, freshDb, utc } from './testUtils';

const SELECTIONS: Selection[] = ['HOME', 'DRAW', 'AWAY'];
const HOUR = 3_600_000;

function run(seed: number, steps: number) {
  const rand = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;

  const db = freshDb();
  const r = repos(db);
  let now = new Date('2026-11-01T06:00:00Z');
  createSession(db, int(10_00, 500_00), now);
  const signals = new Map<string, FreezableSignal>();
  let matchNo = 0;
  const snapshots = new Map<number, BetRecord>();
  const ops: Record<string, number> = {};

  const newSignals = () => {
    for (let i = int(0, 4); i > 0; i--) {
      matchNo += 1;
      const kickoff = new Date(now.getTime() + int(1, 40) * HOUR);
      kickoff.setUTCMinutes(0, 0, 0);
      const s = freezable({
        signal_id: `S${matchNo}_${pick(SELECTIONS)}`,
        match_id: `M${matchNo}`,
        kickoff_at: kickoff.toISOString().replace('.000', ''),
        odds: 1.3 + rand() * 4,
        edge: rand() * 0.2,
        stake_fraction: rand() * 0.08,
        recommended: rand() < 0.8,
      });
      signals.set(s.signal_id, s);
    }
    // New versions of known signals: frozen bets must not change.
    for (const s of [...signals.values()].slice(-3)) {
      if (rand() < 0.5)
        signals.set(s.signal_id, { ...s, version: s.version + 1, odds: s.odds + 0.1 });
    }
  };

  const resultsFor = (bets: readonly BetRecord[]): MatchResult[] =>
    [...new Set(bets.map((b) => b.matchId))].map((match_id) =>
      rand() < 0.1
        ? {
            match_id,
            status: pick(['POSTPONED', 'CANCELLED', 'ABANDONED'] as const),
            home_goals: null,
            away_goals: null,
            closing_odds: null,
          }
        : {
            match_id,
            status: 'FINISHED',
            home_goals: int(0, 4),
            away_goals: int(0, 4),
            closing_odds: rand() < 0.5 ? null : { HOME: 2, DRAW: 3.3, AWAY: 3.8 },
          },
    );

  for (let step = 0; step < steps; step++) {
    now = new Date(now.getTime() + int(0, 8) * HOUR);
    const roll = rand();
    let op: string;
    if (roll < 0.35) {
      op = 'follow';
      newSignals();
      for (const b of followAdvice(db, [...signals.values()], now, utc).frozen)
        snapshots.set(b.id, b);
    } else if (roll < 0.7) {
      op = 'settle';
      const due = r.bets
        .listOpen()
        .filter((b) => Date.parse(b.kickoffAt) + 2 * HOUR <= now.getTime());
      const results = resultsFor(due.filter(() => rand() < 0.8));
      const out = settleFromResults(db, results, now);
      expect(out.errors).toEqual([]);
      const before = r.sessions.list().map((s) => r.bankroll.current(s.id));
      expect(settleFromResults(db, results, now).settled).toEqual([]); // FR-R5
      expect(r.sessions.list().map((s) => r.bankroll.current(s.id))).toEqual(before);
    } else if (roll < 0.8) {
      op = 'reset';
      resetSession(db, int(10_00, 1_000_00), now);
    } else if (roll < 0.9) {
      op = 'flag';
      flagStaleBets(db, now);
    } else {
      op = 'idle';
      now = new Date(now.getTime() + int(0, 48) * HOUR);
    }
    ops[op] = (ops[op] ?? 0) + 1;

    const report = checkConsistency(db);
    if (!report.ok)
      throw new Error(`seed ${seed}, step ${step} (${op}):\n${report.issues.join('\n')}`);
  }

  // Frozen fields never changed (NFR-I1).
  const frozen = (b: BetRecord) => {
    const { status, settledAt, payoutCents, profitCents, closingOdds, reviewFlag, ...rest } = b;
    void [status, settledAt, payoutCents, profitCents, closingOdds, reviewFlag];
    return rest;
  };
  for (const [id, snap] of snapshots) expect(frozen(r.bets.getById(id)!)).toEqual(frozen(snap));

  // AC-7: per session and local day, total stake <= cap of the bankroll at day start.
  for (const s of r.sessions.list()) {
    const byDay = new Map<string, number>();
    for (const b of r.bets.listBySession(s.id)) {
      const day = dayKeyOf(b.kickoffAt, utc);
      byDay.set(day, (byDay.get(day) ?? 0) + b.stakeCents);
    }
    for (const [day, total] of byDay) {
      const start = r.bankroll.atDayStart(s.id, dayStartUtc(day, utc).toISOString());
      expect(total).toBeLessThanOrEqual(dailyCapCents(start, s.settings));
    }
  }
  return { ops, bets: snapshots.size, sessions: r.sessions.list().length };
}

it.each([1, 7, 42])('seed %i: 200 random operations keep every invariant', (seed) => {
  const { ops, bets, sessions } = run(seed, 200);
  expect(Object.values(ops).reduce((a, b) => a + b, 0)).toBe(200);
  expect(ops.follow).toBeGreaterThan(30);
  expect(ops.settle).toBeGreaterThan(30);
  expect(bets).toBeGreaterThan(20);
  expect(sessions).toBeGreaterThan(1);
});
