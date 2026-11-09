import { bet, result } from './fixtures';
import { isReviewDue, settle } from './settlement';

describe('settle', () => {
  it('won: payout = stake × odds, profit = payout − stake', () => {
    expect(settle(bet({ odds: 2.1, stakeCents: 224 }), result())).toEqual({
      status: 'won',
      payoutCents: 470, // 4.704 → $4.70
      profitCents: 246,
      closingOdds: 1.9,
    });
  });

  it('lost: payout 0, profit −stake', () => {
    expect(settle(bet({ selection: 'DRAW' }), result())).toMatchObject({
      status: 'lost',
      payoutCents: 0,
      profitCents: -500,
      closingOdds: 3.6,
    });
  });

  it('settles draws and away wins', () => {
    const draw = result({ home_goals: 1, away_goals: 1 });
    expect(settle(bet({ selection: 'DRAW', odds: 3.5 }), draw)).toMatchObject({
      status: 'won',
      payoutCents: 1750,
    });
    const away = result({ home_goals: 0, away_goals: 3 });
    expect(settle(bet({ selection: 'AWAY' }), away).status).toBe('won');
    expect(settle(bet({ selection: 'HOME' }), away).status).toBe('lost');
  });

  it.each(['POSTPONED', 'CANCELLED', 'ABANDONED'] as const)(
    '%s is void and returns the stake',
    (status) => {
      expect(
        settle(bet(), result({ status, home_goals: null, away_goals: null, closing_odds: null })),
      ).toEqual({ status: 'void', payoutCents: 500, profitCents: 0, closingOdds: null });
    },
  );

  it('rejects a result for another match', () => {
    expect(() => settle(bet(), result({ match_id: 'PL_20261109_LIV_EVE' }))).toThrow(
      /does not belong/,
    );
  });

  it('rejects a finished match without a score', () => {
    expect(() => settle(bet(), result({ away_goals: null }))).toThrow(/without a score/);
  });

  it('rejects non-integer stakes', () => {
    expect(() => settle(bet({ stakeCents: 1.5 }), result())).toThrow(RangeError);
  });
});

describe('isReviewDue', () => {
  const kickoffAt = '2026-11-09T20:00:00Z';

  it('flags an open bet 72 h after kickoff', () => {
    expect(isReviewDue({ status: 'open', kickoffAt }, new Date('2026-11-12T19:59:59Z'))).toBe(
      false,
    );
    expect(isReviewDue({ status: 'open', kickoffAt }, new Date('2026-11-12T20:00:00Z'))).toBe(true);
  });

  it('never flags settled bets', () => {
    expect(isReviewDue({ status: 'won', kickoffAt }, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });
});
