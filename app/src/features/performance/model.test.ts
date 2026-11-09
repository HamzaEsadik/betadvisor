import { repos } from '@/src/db/repos';
import { createSession, resetSession } from '@/src/db/services';
import { freshDb, utc } from '@/src/db/testUtils';
import { averageClv, bootstrapRoi, maxDrawdown, profitBy, summarize } from '@/src/domain/metrics';
import { generatedBets, seedBets } from '../__tests__/ledgerSeed';
import { listing, loadPerformance, settledCurve } from './model';

const NOW = new Date('2026-10-12T08:00:00Z');

describe('settledCurve', () => {
  it('moves only when a bet settles, by its profit', () => {
    const db = freshDb();
    createSession(db, 100_00, NOW);
    seedBets(db, [
      { kickoffAt: '2026-10-12T14:00:00Z', stakeCents: 200, odds: 2.5, status: 'won' },
      { kickoffAt: '2026-10-12T16:00:00Z', stakeCents: 300, status: 'lost' },
      { kickoffAt: '2026-10-12T18:00:00Z', stakeCents: 150, status: 'void' },
      { kickoffAt: '2026-10-12T20:00:00Z', stakeCents: 400 },
    ]);
    const r = repos(db);
    const s = r.sessions.getActive()!;
    const curve = settledCurve(100_00, r.bankroll.listBySession(s.id), r.bets.listBySession(s.id));
    expect(curve).toEqual([100_00, 103_00, 100_00, 100_00]);
  });

  it('fails loudly on a settle entry of another session', () => {
    const entry = {
      id: 9,
      sessionId: 1,
      at: '',
      deltaCents: 1,
      bankrollCents: 1,
      reason: 'settle' as const,
      betId: 42,
    };
    expect(() => settledCurve(100, [entry], [])).toThrow('no bet');
  });
});

describe('loadPerformance', () => {
  it('is null before Setup', () => {
    expect(loadPerformance(freshDb(), null)).toBeNull();
  });

  it('matches domain/metrics for a generated ledger (FR-P2 to FR-P6)', () => {
    const db = freshDb();
    createSession(db, 100_00, NOW);
    const specs = generatedBets(60, '2026-11-09T18:00:00Z').map((b, i) =>
      b.status !== 'open' && i % 3 === 0 ? { ...b, closingOdds: (b.odds ?? 2) - 0.1 } : b,
    );
    seedBets(db, specs);
    const r = repos(db);
    const bets = r.bets.listBySession(r.sessions.getActive()!.id);
    const p = loadPerformance(db, null, utc)!;
    expect(p.summary).toEqual(summarize(bets));
    expect(p.interval).toEqual(bootstrapRoi(bets));
    expect(p.clv).toEqual(averageClv(bets));
    expect(p.byLeague).toEqual(profitBy(bets, 'league'));
    expect(p.byMarket).toEqual(profitBy(bets, 'market'));
    expect(p.drawdown).toEqual(maxDrawdown(p.curveCents));
    expect(p.settled).toBe(57);
    // Bankroll = last point of the settled curve minus the open stakes.
    const open = bets.filter((b) => b.status === 'open').reduce((t, b) => t + b.stakeCents, 0);
    expect(p.bankrollCents).toBe(p.curveCents.at(-1)! - open);
    expect(p.startDay).toBe('2026-10-12');
    expect(p.endDay).toBeNull();
  });

  it('lists the active session first and loads a closed one by id (FR-P7)', () => {
    const db = freshDb();
    createSession(db, 100_00, NOW);
    seedBets(db, [{ kickoffAt: '2026-10-12T14:00:00Z', stakeCents: 200, status: 'lost' }]);
    const { closed } = resetSession(db, 50_00, new Date('2026-11-01T10:00:00Z'));
    const active = loadPerformance(db, null, utc)!;
    expect(active.number).toBe(2);
    expect(active.choices).toEqual([
      { id: 2, number: 2, active: true },
      { id: 1, number: 1, active: false },
    ]);
    expect(active.summary.bets).toBe(0);
    const old = loadPerformance(db, closed.id, utc)!;
    expect(old.number).toBe(1);
    expect(old.bankrollCents).toBe(98_00);
    expect(old.endDay).toBe('2026-11-01');
    // An unknown id falls back to the active session.
    expect(loadPerformance(db, 99, utc)!.number).toBe(2);
  });
});

it('listing joins with commas and "and"', () => {
  expect(listing([])).toBe('');
  expect(listing([9])).toBe('9');
  expect(listing([9, 8])).toBe('9 and 8');
  expect(listing([9, 8, 7, 7])).toBe('9, 8, 7 and 7');
});
