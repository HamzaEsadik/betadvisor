/** Part 13: the Ledger tab over the in-memory database (FR-L1 to FR-L3, NFR-P3). */
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { repos } from '@/src/db/repos';
import { resetSession } from '@/src/db/services';
import { ledgerCsv } from '../ledger/csv';
import { ledgerBets } from '../ledger/model';
import { shareCsv } from '../ledger/share';
import { renderApp } from './harness';
import { generatedBets, seedBets, type SeedBet } from './ledgerSeed';

jest.mock('../ledger/share', () => ({ shareCsv: jest.fn(() => Promise.resolve()) }));

const AT = '2026-11-09T09:00:00Z';

/** Design 13: three open today, two settled yesterday, two the day before. */
const DESIGN: SeedBet[] = [
  {
    league: 'Ligue 1',
    home: 'Marseille',
    away: 'Lens',
    kickoffAt: '2026-11-07T20:00:00Z',
    selection: 'DRAW',
    odds: 3.3,
    stakeCents: 170,
    status: 'void',
  },
  {
    league: 'La Liga',
    home: 'Real Sociedad',
    away: 'Celta',
    kickoffAt: '2026-11-07T16:15:00Z',
    odds: 2.15,
    stakeCents: 220,
    status: 'won',
  },
  {
    league: 'La Liga',
    home: 'Valencia',
    away: 'Osasuna',
    kickoffAt: '2026-11-08T14:00:00Z',
    selection: 'AWAY',
    odds: 3.6,
    stakeCents: 180,
    status: 'lost',
  },
  {
    league: 'Premier League',
    home: 'Man City',
    away: 'Newcastle',
    kickoffAt: '2026-11-08T17:30:00Z',
    odds: 1.8,
    stakeCents: 260,
    status: 'won',
  },
  {
    league: 'Bundesliga',
    home: 'Bayern',
    away: 'Dortmund',
    kickoffAt: '2026-11-09T18:30:00Z',
    selection: 'AWAY',
    odds: 4.2,
    stakeCents: 112,
  },
  {
    league: 'Premier League',
    home: 'Arsenal',
    away: 'Chelsea',
    kickoffAt: '2026-11-09T20:00:00Z',
    odds: 2.1,
    stakeCents: 224,
  },
  {
    league: 'La Liga',
    home: 'Real Betis',
    away: 'Villarreal',
    kickoffAt: '2026-11-09T21:00:00Z',
    odds: 2.3,
    stakeCents: 167,
  },
];

async function openLedger(seed: SeedBet[] = DESIGN, budgetCents = 100_00) {
  const app = await renderApp({ at: AT, budgetCents });
  const bets = seedBets(app.db, seed);
  await act(async () => {
    router.push('/ledger');
  });
  expect(screen.getByTestId('screen-ledger')).toBeTruthy();
  return { ...app, seeded: bets };
}

const rowIds = () =>
  screen
    .queryAllByTestId(/^ledger-row-/)
    .map((el) => Number(String(el.props.testID).replace('ledger-row-', '')));

describe('Ledger', () => {
  it('lists the session bets newest first, grouped by day, with chip counts (design 13)', async () => {
    const { seeded } = await openLedger();
    expect(screen.getByText('Session 1')).toBeTruthy();
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('7 bets, newest first');
    for (const [key, n] of [
      ['all', 7],
      ['open', 3],
      ['won', 2],
      ['lost', 1],
      ['void', 1],
    ] as const) {
      expect(screen.getByTestId(`filter-${key}`)).toHaveTextContent(new RegExp(`${n}$`));
    }
    expect(screen.getByText('Today · Mon 9 Nov')).toBeTruthy();
    expect(screen.getByText('Sun 8 Nov')).toBeTruthy();
    expect(screen.getByText('Sat 7 Nov')).toBeTruthy();
    const ids = seeded.map((b) => b.id);
    expect(rowIds()).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2], ids[0], ids[1]]);

    const city = within(screen.getByTestId(`ledger-row-${ids[3]}`));
    expect(city.getByText('Man City v Newcastle')).toBeTruthy();
    expect(city.getByText('Sun 17:30 · Man City @ 1.80 · stake $2.60')).toBeTruthy();
    expect(city.getByText('+$2.08')).toBeTruthy();
    const betis = within(screen.getByTestId(`ledger-row-${ids[6]}`));
    expect(betis.getByText('Today 21:00 · Real Betis @ 2.30 · stake $1.67')).toBeTruthy();
    expect(betis.getByText('—')).toBeTruthy();
  });

  it('shows the bankroll after each bet', async () => {
    const { db, seeded } = await openLedger();
    const r = repos(db);
    const session = r.sessions.getActive()!;
    const expected = ledgerBets(
      r.bets.listBySession(session.id),
      r.bankroll.listBySession(session.id),
    );
    for (const b of expected) {
      const row = within(screen.getByTestId(`ledger-row-${b.id}`));
      expect(row.getByText(`Bankroll $${(b.bankrollAfterCents / 100).toFixed(2)}`)).toBeTruthy();
    }
    // The newest open bet is the last stake: its bankroll is the current one.
    const last = seeded[6]!;
    expect(expected.find((b) => b.id === last.id)!.bankrollAfterCents).toBe(
      r.bankroll.current(session.id),
    );
  });

  it('combines status, league and date filters', async () => {
    const { seeded } = await openLedger();
    const ids = seeded.map((b) => b.id);
    await fireEvent.press(screen.getByTestId('league-La Liga'));
    expect(rowIds()).toEqual([ids[6], ids[2], ids[1]]);
    expect(screen.getByTestId('filter-won')).toHaveTextContent(/1$/);
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('3 of 7 bets, newest first');

    await fireEvent.press(screen.getByTestId('filter-won'));
    expect(rowIds()).toEqual([ids[1]]);

    await fireEvent.press(screen.getByTestId('filter-all'));
    await fireEvent.press(screen.getByTestId('date-filter'));
    await fireEvent.changeText(screen.getByTestId('date-from'), '2026-11-08');
    await fireEvent.changeText(screen.getByTestId('date-to'), '2026-11-09');
    await fireEvent.press(screen.getByTestId('date-apply'));
    expect(rowIds()).toEqual([ids[6], ids[2]]);
    expect(screen.getByTestId('date-filter')).toHaveTextContent('Sun 8 Nov – Mon 9 Nov');

    await fireEvent.press(screen.getByTestId('filter-lost'));
    expect(rowIds()).toEqual([ids[2]]);

    await fireEvent.press(screen.getByTestId('league-all'));
    await fireEvent.press(screen.getByTestId('filter-open'));
    await fireEvent.press(screen.getByTestId('date-filter'));
    await fireEvent.press(screen.getByTestId('date-today'));
    expect(rowIds()).toEqual([ids[6], ids[5], ids[4]]);

    await fireEvent.press(screen.getByTestId('league-Ligue 1'));
    expect(rowIds()).toEqual([]);
    expect(screen.getByTestId('ledger-empty')).toHaveTextContent('No bets match these filters.');
  });

  it('rejects an inverted date range', async () => {
    await openLedger();
    await fireEvent.press(screen.getByTestId('date-filter'));
    await fireEvent.changeText(screen.getByTestId('date-from'), '2026-11-09');
    await fireEvent.changeText(screen.getByTestId('date-to'), '2026-11-01');
    expect(screen.getByText('The start date is after the end date.')).toBeTruthy();
    expect(screen.getByTestId('date-apply').props.accessibilityState?.disabled).toBe(true);
  });

  it('Export CSV shares every bet of the session, whatever the filters', async () => {
    const { db } = await openLedger();
    await fireEvent.press(screen.getByTestId('filter-won'));
    await fireEvent.press(screen.getByTestId('export-csv'));
    const r = repos(db);
    const s = r.sessions.getActive()!;
    const all = ledgerBets(r.bets.listBySession(s.id), r.bankroll.listBySession(s.id));
    expect(shareCsv).toHaveBeenCalledWith('betadvisor-session-1-2026-11-09.csv', ledgerCsv(all));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Exported 7 bets');
  });

  it('reports a failed export', async () => {
    jest.mocked(shareCsv).mockRejectedValueOnce(new Error('Sharing is not available'));
    await openLedger();
    await fireEvent.press(screen.getByTestId('export-csv'));
    expect(await screen.findByText('Sharing is not available')).toBeTruthy();
  });

  it('an empty session says how to record bets', async () => {
    await openLedger([]);
    expect(screen.getByTestId('ledger-empty')).toHaveTextContent(/Follow advice on Today/);
    expect(screen.getByTestId('export-csv').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows a closed session from the Sessions link and goes back to the active one', async () => {
    const app = await renderApp({ at: AT, budgetCents: 100_00 });
    seedBets(app.db, DESIGN);
    resetSession(app.db, 300_00, new Date('2026-11-09T10:00:00Z'));
    await act(async () => {
      router.push('/sessions');
    });
    await fireEvent.press(screen.getByTestId('session-1-ledger'));
    expect(screen.getByTestId('screen-ledger')).toBeTruthy();
    expect(screen.getByText('Session 1 · closed')).toBeTruthy();
    expect(screen.getByTestId('ledger-archived')).toBeTruthy();
    expect(rowIds()).toHaveLength(7);

    await fireEvent.press(screen.getByText('Show active session'));
    expect(screen.getByText('Session 2')).toBeTruthy();
    expect(screen.queryByTestId('ledger-archived')).toBeNull();
    expect(screen.getByTestId('ledger-empty')).toBeTruthy();
  });

  it('renders and scrolls a ledger of 1,000 bets (NFR-P3)', async () => {
    await openLedger(generatedBets(1000, '2026-11-09T20:00:00Z'), 100_000_00);
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('1000 bets, newest first');
    const list = screen.getByTestId('ledger-list');
    const rendered = rowIds().length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(1000); // virtualized
    for (let y = 0; y <= 60_000; y += 6_000) {
      await act(async () => {
        fireEvent.scroll(list, {
          nativeEvent: {
            contentOffset: { x: 0, y },
            contentSize: { width: 390, height: 120_000 },
            layoutMeasurement: { width: 390, height: 844 },
          },
        });
      });
    }
    expect(rowIds().length).toBeGreaterThan(0);
  });
});
