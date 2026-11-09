/** SRS §10.2 acceptance criteria covered by pure domain logic. */
import { signal, result } from './fixtures';
import { mulberry32 } from './metrics';
import { settle } from './settlement';
import { planDay } from './stakes';
import { DEFAULT_STAKE_SETTINGS } from './types';

const before = new Date('2026-11-09T07:00:00Z');

/** Bankroll after freezing (stake reserved) and settling (payout added), FR-R4. */
function bankrollAfter(startCents: number, stakeCents: number, payoutCents: number): number {
  return startCents - stakeCents + payoutCents;
}

describe('acceptance criteria', () => {
  it('AC-1: a $100 budget and stake fraction 0.05 freezes a $5.00 bet', () => {
    const plan = planDay(
      [signal({ stake_fraction: 0.05 })],
      100_00,
      DEFAULT_STAKE_SETTINGS,
      before,
    );
    expect(plan.toFollow).toHaveLength(1);
    expect(plan.toFollow[0]!.stakeCents).toBe(500);
  });

  it('AC-2: after the bet wins at odds 2.00 the bankroll is $105.00', () => {
    const s = settle(
      { matchId: result().match_id, selection: 'HOME', odds: 2, stakeCents: 500 },
      result(),
    );
    expect(s.status).toBe('won');
    expect(bankrollAfter(100_00, 500, s.payoutCents)).toBe(105_00);
  });

  it('AC-3: after a loss the bankroll is $95.00', () => {
    const s = settle(
      { matchId: result().match_id, selection: 'HOME', odds: 2, stakeCents: 500 },
      result({ home_goals: 0, away_goals: 1 }),
    );
    expect(s.status).toBe('lost');
    expect(bankrollAfter(100_00, 500, s.payoutCents)).toBe(95_00);
  });

  it('AC-7: total stakes in one day never exceed the daily exposure cap', () => {
    const rand = mulberry32(7);
    for (let day = 0; day < 300; day++) {
      const bankroll = 10_00 + Math.floor(rand() * 5_000_00);
      const n = Math.floor(rand() * 15);
      const signals = Array.from({ length: n }, (_, i) =>
        signal({
          signal_id: `s${i}`,
          match_id: `m${i}`,
          edge: rand() * 0.3,
          stake_fraction: rand() * 0.08,
        }),
      );
      const plan = planDay(signals, bankroll, DEFAULT_STAKE_SETTINGS, before);
      const total = plan.toFollow.reduce((s, b) => s + b.stakeCents, 0);
      expect(total).toBe(plan.totalStakeCents);
      expect(total).toBeLessThanOrEqual(plan.dailyCapCents);
      expect(plan.toFollow.length + plan.skipped.length).toBe(n);
    }
  });
});
