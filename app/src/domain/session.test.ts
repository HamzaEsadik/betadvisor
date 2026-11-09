import { bet } from './fixtures';
import { MAX_BUDGET_CENTS, MIN_BUDGET_CENTS, planReset, validateBudget } from './session';

describe('validateBudget (FR-S1)', () => {
  it.each([
    ['100', 100_00],
    ['107.2', 107_20],
    ['107,20', 107_20],
    [' $300 ', 300_00],
    ['€ 50.5', 50_50],
    ['10', MIN_BUDGET_CENTS],
    ['1000000', MAX_BUDGET_CENTS],
    ['1000000.00', MAX_BUDGET_CENTS],
    ['25.', 25_00],
  ])('%j → %i cents', (input, cents) => {
    expect(validateBudget(input)).toEqual({ ok: true, cents });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'not_a_number'],
    ['-50', 'not_a_number'],
    ['1e3', 'not_a_number'],
    ['1.000.000', 'not_a_number'],
    ['10.555', 'too_many_decimals'],
    ['9.99', 'below_min'],
    ['0', 'below_min'],
    ['1,000', 'too_many_decimals'],
    ['1000000.01', 'above_max'],
    ['9999999999999', 'above_max'],
  ])('%j → %s', (input, error) => {
    expect(validateBudget(input)).toEqual({ ok: false, error });
  });
});

describe('planReset (FR-S3 to FR-S6)', () => {
  const active = { id: 1, startingBudgetCents: 100_00, startedAt: '2026-11-01T08:00:00Z' };
  const now = new Date('2026-11-09T12:00:00Z');
  const bets = [
    { ...bet({ status: 'won', stakeCents: 500, payoutCents: 1000, profitCents: 500 }), id: 1 },
    { ...bet({ status: 'lost', stakeCents: 400, payoutCents: 0, profitCents: -400 }), id: 2 },
    { ...bet({ stakeCents: 224 }), id: 3 },
    { ...bet({ stakeCents: 112 }), id: 4 },
  ];

  it('closes the active session, keeps open bets archived and starts the new one', () => {
    const plan = planReset(active, bets, 99_64, 300_00, now);
    expect(plan.close).toMatchObject({
      sessionId: 1,
      endedAt: '2026-11-09T12:00:00.000Z',
      finalBankrollCents: 99_64,
    });
    expect(plan.close.stats).toMatchObject({ bets: 4, open: 2, profitCents: 100 });
    expect(plan.archivedOpenBetIds).toEqual([3, 4]);
    expect(plan.confirmation).toEqual({
      currentBankrollCents: 99_64,
      openBets: 2,
      openStakeCents: 336,
    });
    expect(plan.newSession).toEqual({
      startingBudgetCents: 300_00,
      startedAt: '2026-11-09T12:00:00.000Z',
    });
  });

  it('rejects an out-of-range or fractional new budget', () => {
    expect(() => planReset(active, [], 100_00, 9_99, now)).toThrow(RangeError);
    expect(() => planReset(active, [], 100_00, MAX_BUDGET_CENTS + 1, now)).toThrow(RangeError);
    expect(() => planReset(active, [], 100_00, 100_00.5, now)).toThrow(RangeError);
    expect(() => planReset(active, [], 1.5, 100_00, now)).toThrow(RangeError);
  });
});
