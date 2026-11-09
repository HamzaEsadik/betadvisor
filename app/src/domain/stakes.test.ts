import { signal } from './fixtures';
import {
  dailyCapCents,
  isBankrollDepleted,
  isKickoffPassed,
  planDay,
  referenceNow,
  stakeFor,
} from './stakes';
import { DEFAULT_STAKE_SETTINGS as S } from './types';

const morning = new Date('2026-11-09T07:00:00Z');

describe('stakeFor', () => {
  it('rounds fraction × bankroll to whole cents (design 02: 0.0209 × $107.20 → $2.24)', () => {
    expect(stakeFor(0.0209, 107_20, S)).toBe(224);
    expect(stakeFor(0.010469, 107_20, S)).toBe(112);
  });

  it('applies the per-bet cap', () => {
    expect(stakeFor(0.2, 100_00, S)).toBe(500);
  });

  it('treats a negative fraction as zero', () => {
    expect(stakeFor(-0.1, 100_00, S)).toBe(0);
  });
});

describe('planDay', () => {
  it('reproduces the design 02 stakes for a $107.20 bankroll', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'a', match_id: 'A', edge: 0.134, stake_fraction: 0.010469 }),
        signal({ signal_id: 'b', match_id: 'B', edge: 0.092, stake_fraction: 0.020909 }),
      ],
      107_20,
      S,
      morning,
    );
    expect(plan.toFollow.map((b) => b.stakeCents)).toEqual([112, 224]);
    expect(plan.totalStakeCents).toBe(336);
    expect(plan.depleted).toBe(false);
  });

  it('fills the daily cap in descending edge order and skips the rest as cap reached', () => {
    // cap = 15% of $100 = $15; each stake $5.
    const signals = ['low', 'top', 'mid', 'second', 'last'].map((id, i) =>
      signal({
        signal_id: id,
        match_id: id,
        edge: { low: 0.05, top: 0.3, mid: 0.1, second: 0.2, last: 0.01 }[id]!,
        stake_fraction: 0.05,
        kickoff_at: `2026-11-09T1${i}:00:00Z`,
      }),
    );
    const plan = planDay(signals, 100_00, S, morning);
    expect(plan.dailyCapCents).toBe(15_00);
    expect(plan.toFollow.map((b) => b.signal.signal_id)).toEqual(['top', 'second', 'mid']);
    expect(plan.skipped.map((s) => [s.signal.signal_id, s.reason])).toEqual([
      ['low', 'daily_cap_reached'],
      ['last', 'daily_cap_reached'],
    ]);
  });

  it('once the cap is reached, a smaller later stake is still skipped', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'a', match_id: 'A', edge: 0.3, stake_fraction: 0.05 }),
        signal({ signal_id: 'b', match_id: 'B', edge: 0.2, stake_fraction: 0.05 }),
        signal({ signal_id: 'c', match_id: 'C', edge: 0.1, stake_fraction: 0.05 }),
        signal({ signal_id: 'd', match_id: 'D', edge: 0.05, stake_fraction: 0.04 }),
        signal({ signal_id: 'e', match_id: 'E', edge: 0.04, stake_fraction: 0.02 }),
      ],
      90_00,
      S,
      morning,
    );
    // cap $13.50; a, b, c ($4.50 each) fill it exactly; d ($3.60) and e ($1.80) are cap-skipped.
    expect(plan.toFollow.map((b) => b.signal.signal_id)).toEqual(['a', 'b', 'c']);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['daily_cap_reached', 'daily_cap_reached']);
  });

  it('breaks edge ties by kickoff then signal id', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'z', match_id: 'Z', kickoff_at: '2026-11-09T18:00:00Z' }),
        signal({ signal_id: 'y', match_id: 'Y', kickoff_at: '2026-11-09T18:00:00Z' }),
        signal({ signal_id: 'x', match_id: 'X', kickoff_at: '2026-11-09T19:00:00Z' }),
      ],
      100_00,
      S,
      morning,
    );
    expect(plan.toFollow.map((b) => b.signal.signal_id)).toEqual(['y', 'z', 'x']);
  });

  it('keeps the feed skip reason for signals that are not recommended', () => {
    const plan = planDay(
      [
        signal({ recommended: false, skip_reason: 'missing_data', stake_fraction: 0 }),
        signal({ signal_id: 'n', recommended: false, skip_reason: null, stake_fraction: 0 }),
      ],
      100_00,
      S,
      morning,
    );
    expect(plan.toFollow).toEqual([]);
    expect(plan.skipped.map((s) => [s.reason, s.stakeCents])).toEqual([
      ['missing_data', null],
      ['no_edge', null],
    ]);
  });

  it('skips stakes below the minimum', () => {
    const plan = planDay([signal({ stake_fraction: 0.005 })], 100_00, S, morning);
    expect(plan.skipped[0]).toMatchObject({ reason: 'below_min_stake', stakeCents: 50 });
  });

  it('reports a depleted bankroll when no stake can reach the minimum', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'a', match_id: 'A', stake_fraction: 0.05 }),
        signal({ signal_id: 'b', match_id: 'B', stake_fraction: 0.02 }),
      ],
      19_00,
      S,
      morning,
    );
    expect(plan.depleted).toBe(true);
    expect(plan.toFollow).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['bankroll_depleted', 'bankroll_depleted']);
  });

  it('skips matches whose kickoff has passed (FR-A10)', () => {
    const plan = planDay([signal({ kickoff_at: '2026-11-09T07:00:00Z' })], 100_00, S, morning);
    expect(plan.skipped[0]!.reason).toBe('kickoff_passed');
  });

  it('recommends at most one selection per match and market (§9.6)', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'home', selection: 'HOME', edge: 0.05 }),
        signal({ signal_id: 'draw', selection: 'DRAW', edge: 0.08 }),
      ],
      100_00,
      S,
      morning,
    );
    expect(plan.toFollow.map((b) => b.signal.signal_id)).toEqual(['draw']);
    expect(plan.skipped[0]).toMatchObject({ reason: 'duplicate_selection', stakeCents: null });
  });

  it('excludes frozen signals and counts their stakes toward the cap', () => {
    const plan = planDay(
      [
        signal({ signal_id: 'frozen', match_id: 'F', stake_fraction: 0.05 }),
        signal({ signal_id: 'other-sel', match_id: 'F', selection: 'AWAY' }),
        signal({ signal_id: 'a', match_id: 'A', edge: 0.2, stake_fraction: 0.05 }),
        signal({ signal_id: 'b', match_id: 'B', edge: 0.1, stake_fraction: 0.05 }),
      ],
      100_00,
      S,
      morning,
      [
        { signalId: 'frozen', stakeCents: 500 },
        { signalId: 'earlier', stakeCents: 500 },
      ],
    );
    expect(plan.toFollow.map((b) => b.signal.signal_id)).toEqual(['a']);
    expect(plan.skipped.map((s) => [s.signal.signal_id, s.reason])).toEqual([
      ['b', 'daily_cap_reached'],
      ['other-sel', 'duplicate_selection'],
    ]);
    expect(plan.totalStakeCents).toBe(15_00);
  });

  it('rejects a non-integer bankroll', () => {
    expect(() => planDay([], 100.5, S, morning)).toThrow(RangeError);
  });
});

describe('clock skew (§9.5)', () => {
  const generatedAt = '2026-11-09T07:00:00Z';

  it('uses the device time when it is plausible', () => {
    const device = new Date('2026-11-09T19:00:00Z');
    expect(referenceNow({ deviceNow: device, feedGeneratedAt: generatedAt })).toBe(device);
    expect(referenceNow({ deviceNow: device })).toBe(device);
    expect(referenceNow(device)).toBe(device);
  });

  it('tolerates a device up to 10 minutes behind the feed', () => {
    const device = new Date('2026-11-09T06:50:00Z');
    expect(referenceNow({ deviceNow: device, feedGeneratedAt: generatedAt })).toBe(device);
  });

  it('uses generated_at when the device clock is more than 10 minutes behind', () => {
    const device = new Date('2026-11-08T07:00:00Z');
    const clock = { deviceNow: device, feedGeneratedAt: generatedAt };
    expect(referenceNow(clock).toISOString()).toBe('2026-11-09T07:00:00.000Z');
    expect(isKickoffPassed('2026-11-09T06:30:00Z', clock)).toBe(true);
    expect(isKickoffPassed('2026-11-09T06:30:00Z', device)).toBe(false);
  });

  it('rejects a malformed generated_at', () => {
    expect(() => referenceNow({ deviceNow: morning, feedGeneratedAt: 'nope' })).toThrow(RangeError);
  });

  it('planDay accepts a clock', () => {
    const plan = planDay([signal({ kickoff_at: '2026-11-09T06:30:00Z' })], 100_00, S, {
      deviceNow: new Date('2026-11-01T00:00:00Z'),
      feedGeneratedAt: generatedAt,
    });
    expect(plan.skipped[0]!.reason).toBe('kickoff_passed');
  });
});

describe('caps', () => {
  it('daily cap is 15% of the bankroll at start of day', () => {
    expect(dailyCapCents(107_20, S)).toBe(16_08);
  });

  it('depleted threshold sits at $20 with a 5% cap and $1 minimum', () => {
    expect(isBankrollDepleted(20_00, S)).toBe(false);
    expect(isBankrollDepleted(19_89, S)).toBe(true);
    expect(isBankrollDepleted(0, S)).toBe(true);
  });
});
