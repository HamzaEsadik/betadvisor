import { bet } from './fixtures';
import {
  averageClv,
  bootstrapRoi,
  clv,
  maxDrawdown,
  mulberry32,
  profitBy,
  quantile,
  summarize,
} from './metrics';

const won = (stake: number, odds: number, over = {}) =>
  bet({
    status: 'won',
    stakeCents: stake,
    odds,
    payoutCents: Math.round(stake * odds),
    profitCents: Math.round(stake * odds) - stake,
    ...over,
  });
const lost = (stake: number, odds = 2, over = {}) =>
  bet({ status: 'lost', stakeCents: stake, odds, payoutCents: 0, profitCents: -stake, ...over });
const voided = (stake: number, over = {}) =>
  bet({ status: 'void', stakeCents: stake, payoutCents: stake, profitCents: 0, ...over });

describe('summarize', () => {
  it('computes counts, ROI, hit rate and averages', () => {
    const bets = [won(500, 2), lost(500), voided(300), bet({ stakeCents: 200, odds: 3 })];
    expect(summarize(bets)).toEqual({
      bets: 4,
      open: 1,
      won: 1,
      lost: 1,
      void: 1,
      totalStakedCents: 1000,
      profitCents: 0,
      roi: 0,
      hitRate: 0.5,
      averageOdds: 2.25,
      averageStakeCents: 375,
    });
  });

  it('ROI = profit / staked over decided bets', () => {
    const s = summarize([won(1000, 2.5), lost(500), lost(500)]);
    expect(s.profitCents).toBe(500);
    expect(s.roi).toBeCloseTo(0.25);
    expect(s.hitRate).toBeCloseTo(1 / 3);
  });

  it('returns nulls for an empty session', () => {
    expect(summarize([])).toMatchObject({
      bets: 0,
      roi: null,
      hitRate: null,
      averageOdds: null,
      averageStakeCents: null,
    });
  });

  it('rejects a settled bet without profit', () => {
    expect(() => summarize([bet({ status: 'won' })])).toThrow(/without profit/);
  });
});

describe('maxDrawdown', () => {
  it('is 0 on a monotonic rising curve', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toEqual({
      amountCents: 0,
      pct: 0,
      peakIndex: 0,
      troughIndex: 0,
    });
  });

  it('is 0 on an empty or single-point curve', () => {
    expect(maxDrawdown([]).amountCents).toBe(0);
    expect(maxDrawdown([500]).amountCents).toBe(0);
  });

  it('finds the largest peak-to-trough fall and its indices', () => {
    //                 0      1      2      3      4      5      6
    const curve = [100_00, 120_00, 90_00, 110_00, 130_00, 95_00, 140_00];
    expect(maxDrawdown(curve)).toEqual({
      amountCents: 35_00,
      pct: 35 / 130,
      peakIndex: 4,
      troughIndex: 5,
    });
  });

  it('handles a curve that only falls', () => {
    expect(maxDrawdown([100, 80, 50])).toEqual({
      amountCents: 50,
      pct: 0.5,
      peakIndex: 0,
      troughIndex: 2,
    });
  });

  it('reports pct 0 when the peak is 0', () => {
    expect(maxDrawdown([0, -10]).pct).toBe(0);
  });
});

describe('profitBy', () => {
  const bets = [
    won(500, 2, { league: 'Premier League' }),
    lost(300, 2, { league: 'La Liga' }),
    lost(200, 2, { league: 'Premier League' }),
    voided(100, { league: 'Bundesliga' }),
    bet({ league: 'Ligue 1' }),
  ];

  it('groups settled bets by league, largest profit first', () => {
    expect(profitBy(bets, 'league')).toEqual([
      { key: 'Premier League', bets: 2, stakedCents: 700, profitCents: 300 },
      { key: 'Bundesliga', bets: 1, stakedCents: 0, profitCents: 0 },
      { key: 'La Liga', bets: 1, stakedCents: 300, profitCents: -300 },
    ]);
  });

  it('groups by market', () => {
    expect(profitBy(bets, 'market')).toEqual([
      { key: '1X2', bets: 4, stakedCents: 1000, profitCents: 0 },
    ]);
  });

  it('orders equal profits by key', () => {
    const even = [voided(100, { league: 'b' }), voided(100, { league: 'a' })];
    expect(profitBy(even, 'league').map((g) => g.key)).toEqual(['a', 'b']);
  });
});

describe('CLV', () => {
  it('per bet: taken / closing − 1', () => {
    expect(clv(2.1, 2.0)).toBeCloseTo(0.05);
  });

  it('averages over bets with closing odds', () => {
    const r = averageClv([
      bet({ odds: 2.2, closingOdds: 2.0 }),
      bet({ odds: 1.8, closingOdds: 2.0 }),
      bet({ odds: 3, closingOdds: null }),
    ]);
    expect(r?.bets).toBe(2);
    expect(r?.value).toBeCloseTo(0);
  });

  it('is null without closing odds', () => {
    expect(averageClv([bet()])).toBeNull();
  });
});

describe('bootstrapRoi', () => {
  const rand = mulberry32(42);
  const bets = Array.from({ length: 60 }, () => (rand() < 0.45 ? won(500, 2.1) : lost(500, 2.1)));

  it('is deterministic with the same seed', () => {
    expect(bootstrapRoi(bets, { seed: 3 })).toEqual(bootstrapRoi(bets, { seed: 3 }));
  });

  it('differs with another seed', () => {
    expect(bootstrapRoi(bets, { seed: 3 })).not.toEqual(bootstrapRoi(bets, { seed: 4 }));
  });

  it('brackets the observed ROI with a 90% interval', () => {
    const roi = summarize(bets).roi!;
    const ci = bootstrapRoi(bets)!;
    expect(ci.bets).toBe(60);
    expect(ci.low).toBeLessThan(roi);
    expect(ci.high).toBeGreaterThan(roi);
    const wider = bootstrapRoi(bets, { level: 0.99 })!;
    expect(wider.low).toBeLessThanOrEqual(ci.low);
    expect(wider.high).toBeGreaterThanOrEqual(ci.high);
  });

  it('ignores open and void bets and returns null without decided bets', () => {
    expect(bootstrapRoi([bet(), voided(100)])).toBeNull();
    expect(bootstrapRoi([won(500, 2), bet()], { resamples: 10 })).toEqual({
      low: 1,
      high: 1,
      bets: 1,
    });
  });
});

describe('helpers', () => {
  it('mulberry32 yields floats in [0, 1)', () => {
    const r = mulberry32(0);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('quantile interpolates', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
  });
});
