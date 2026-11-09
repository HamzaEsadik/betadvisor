/** Part 14: Performance (design 14), FR-P1 to FR-P7. */
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { repos } from '@/src/db/repos';
import { resetSession } from '@/src/db/services';
import { bootstrapRoi, summarize } from '@/src/domain/metrics';
import { format } from '@/src/ui';
import { renderApp } from './harness';
import { seedBets, type SeedBet } from './ledgerSeed';

const AT = '2026-11-09T09:00:00Z';

/** Settled: won +3.00 (PL), lost -3.00 (La Liga), won +1.00 (Bundesliga, CLV), void (PL). */
const BETS: SeedBet[] = [
  {
    league: 'Premier League',
    kickoffAt: '2026-11-07T14:00:00Z',
    odds: 2.5,
    stakeCents: 200,
    status: 'won',
  },
  { league: 'La Liga', kickoffAt: '2026-11-07T17:00:00Z', stakeCents: 300, status: 'lost' },
  {
    league: 'Bundesliga',
    kickoffAt: '2026-11-08T14:00:00Z',
    stakeCents: 100,
    status: 'won',
    closingOdds: 1.8,
  },
  { league: 'Premier League', kickoffAt: '2026-11-08T17:00:00Z', stakeCents: 150, status: 'void' },
  { league: 'Premier League', kickoffAt: '2026-11-09T20:00:00Z', stakeCents: 400 },
];

const tile = (key: string) => String(screen.getByTestId(`stat-${key}`).props.accessibilityLabel);

async function openPerformance() {
  const app = await renderApp({ at: AT, budgetCents: 100_00 });
  const seeded = seedBets(app.db, BETS);
  await act(async () => {
    router.navigate('/performance');
  });
  expect(screen.getByTestId('screen-performance')).toBeTruthy();
  return { ...app, seeded };
}

describe('Performance', () => {
  it('shows the metrics of domain/metrics for the fixture ledger (FR-P2 to FR-P6)', async () => {
    const { seeded } = await openPerformance();
    const sum = summarize(seeded);
    expect(sum).toMatchObject({ bets: 5, won: 2, lost: 1, void: 1, open: 1, profitCents: 100 });

    expect(tile('bankroll')).toBe('Bankroll: $97.00. Start $100.00');
    expect(tile('pl')).toBe('Profit / loss: +$1.00, up. Settled bets');
    expect(tile('roi')).toBe(`ROI: ${format.signedPct(sum.roi!, 1)}, up. 4 settled bets`);
    expect(tile('roi')).toMatch(/^ROI: \+16\.7%/);
    expect(tile('hit')).toBe('Hit rate: 67%. 2 won / 1 lost');
    expect(tile('bets')).toBe('Bets: 5. 1 open · 1 void');
    // Curve 100, 103, 100, 101, 101: the deepest drop is $3.00 from the $103 peak.
    expect(tile('dd')).toBe('Max drawdown: -$3.00, down. 2.9% from peak');
    expect(tile('odds')).toBe('Avg odds: 2.10');
    expect(tile('stake')).toBe('Avg stake: $2.30');
    expect(tile('clv')).toBe('Avg CLV: +11.1%, up. 1 bet with closing odds');

    const iv = bootstrapRoi(seeded)!;
    expect(screen.getByTestId('roi-range')).toHaveTextContent(
      `ROI +16.7% (range ${format.signedPct(iv.low, 0)} to ${format.signedPct(iv.high, 0)}) over 4 settled bets`,
    );
    expect(screen.getByTestId('bankroll-chart')).toBeTruthy();
    expect(screen.getByTestId('chart-drawdown')).toBeTruthy();
    expect(screen.getByTestId('perf-range')).toHaveTextContent('9 Nov to today');
    expect(
      screen.getByText(
        'The dashed line is the starting budget of $100.00. The shaded band marks the deepest drop.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('small-sample')).toBeTruthy();
  });

  it('shows profit by league with arrows and by market (FR-P4)', async () => {
    await openPerformance();
    const league = screen.getByTestId('profit-league');
    const labels = within(league)
      .getAllByLabelText(/bets?$/)
      .map((n) => String(n.props.accessibilityLabel));
    expect(labels).toEqual([
      'Premier League: +$3.00, up, 2 bets',
      'Bundesliga: +$1.00, up, 1 bet',
      'La Liga: -$3.00, down, 1 bet',
    ]);
    expect(within(league).getByText('Settled bets only. 2, 1 and 1 bets per league.')).toBeTruthy();
    expect(
      within(screen.getByTestId('profit-market')).getByLabelText(
        'Match result (1X2): +$1.00, up, 4 bets',
      ),
    ).toBeTruthy();
  });

  it('switching sessions changes the numbers (FR-P7)', async () => {
    const { db, setNow } = await openPerformance();
    setNow('2026-11-09T10:00:00Z');
    await act(async () => {
      resetSession(db, 50_00, new Date('2026-11-09T10:00:00Z'));
      router.navigate('/ledger');
    });
    await act(async () => {
      router.navigate('/performance');
    });
    expect(screen.getByTestId('perf-session-2')).toHaveTextContent('Session 2 · active');
    expect(tile('bankroll')).toBe('Bankroll: $50.00. Start $50.00');
    expect(tile('bets')).toBe('Bets: 0. 0 open · 0 void');
    expect(tile('roi')).toBe('ROI: —. 0 settled bets');
    expect(screen.getByTestId('bankroll-chart-empty')).toBeTruthy();
    expect(screen.queryByTestId('roi-range')).toBeNull();
    expect(screen.queryByTestId('stat-clv')).toBeNull();
    expect(
      within(screen.getByTestId('profit-league')).getByText('No settled bets yet.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('perf-session-1'));
    expect(screen.getByTestId('perf-session-1').props.accessibilityState?.selected).toBe(true);
    expect(tile('bankroll')).toBe('Final bankroll: $97.00. Start $100.00');
    expect(tile('bets')).toBe('Bets: 5. 1 open · 1 void');
    expect(screen.getByTestId('perf-range')).toHaveTextContent('9 Nov to 9 Nov');

    await fireEvent.press(screen.getByTestId('perf-session-2'));
    expect(tile('bets')).toBe('Bets: 0. 0 open · 0 void');
  });

  it('opens a past session from Sessions (design 04 link)', async () => {
    const { db } = await openPerformance();
    await act(async () => {
      resetSession(db, 50_00, new Date(AT));
      router.navigate('/sessions');
    });
    await fireEvent.press(screen.getByTestId('session-1-performance'));
    expect(screen.getByTestId('screen-performance')).toBeTruthy();
    expect(tile('bets')).toBe('Bets: 5. 1 open · 1 void');
    expect(repos(db).sessions.list()).toHaveLength(2);
  });
});
