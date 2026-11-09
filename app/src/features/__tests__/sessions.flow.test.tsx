/** Part 13: Sessions (design 04) and the Reset sheet (design 05), FR-S3 to FR-S7. */
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { checkConsistency } from '@/src/db/consistency';
import { repos } from '@/src/db/repos';
import { settleFromResults } from '@/src/db/services';
import { finished } from '@/src/db/testUtils';
import { renderApp } from './harness';
import { seedBets, type SeedBet } from './ledgerSeed';

const AT = '2026-11-09T09:00:00Z';

/** Two settled bets (one won, one lost) and three open ones. */
const BETS: SeedBet[] = [
  { kickoffAt: '2026-11-08T14:00:00Z', odds: 3.6, stakeCents: 180, status: 'lost' },
  { kickoffAt: '2026-11-08T17:30:00Z', odds: 1.8, stakeCents: 260, status: 'won' },
  { kickoffAt: '2026-11-09T18:30:00Z', odds: 4.2, stakeCents: 112 },
  { kickoffAt: '2026-11-09T20:00:00Z', odds: 2.1, stakeCents: 224 },
  { kickoffAt: '2026-11-09T21:00:00Z', odds: 2.3, stakeCents: 167 },
];

async function openSessions() {
  const app = await renderApp({ at: AT, budgetCents: 100_00 });
  const seeded = seedBets(app.db, BETS);
  await act(async () => {
    router.push('/sessions');
  });
  expect(screen.getByTestId('screen-sessions')).toBeTruthy();
  return { ...app, seeded };
}

const card = (n: number) => screen.getByTestId(`session-${n}`);
const label = (n: number) =>
  String(within(card(n)).getByLabelText(/^Session \d/).props.accessibilityLabel);

describe('Sessions', () => {
  it('shows the active session with its bankroll, ROI and bets (design 04)', async () => {
    await openSessions();
    // 100 - 1.80 - 2.60 + 4.68 - 1.12 - 2.24 - 1.67 = 95.25; ROI (2.08 - 1.80) / 4.40.
    expect(label(1)).toBe(
      'Session 1, active, 9 Nov 2026 – today. Start $100.00, bankroll $95.25, ROI +6.4%, 5 bets',
    );
    expect(screen.queryByText('Closed')).toBeNull();
    expect(
      screen.getByText(
        'Resetting archives the active session. Bets and history from closed sessions are never deleted.',
      ),
    ).toBeTruthy();
  });

  it('Cancel closes the sheet and changes nothing', async () => {
    const { db } = await openSessions();
    await fireEvent.press(within(card(1)).getByText('Reset budget'));
    expect(screen.getByTestId('reset-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reset-cancel'));
    expect(screen.queryByTestId('reset-confirm')).toBeNull();
    expect(repos(db).sessions.list()).toHaveLength(1);
  });

  it('the sheet confirms bankroll and open bets and validates the budget (FR-S5)', async () => {
    await openSessions();
    await fireEvent.press(within(card(1)).getByText('Reset budget'));
    expect(
      screen.getByText('This closes Session 1 and starts a new session. Nothing is deleted.'),
    ).toBeTruthy();
    expect(screen.getByTestId('reset-bankroll')).toHaveTextContent('$95.25');
    expect(screen.getByTestId('reset-open-bets')).toHaveTextContent('3');
    expect(
      screen.getByText('Archived with Session 1 and still settled for the record'),
    ).toBeTruthy();
    expect(screen.getByTestId('reset-budget-input').props.value).toBe('100');

    await fireEvent.changeText(screen.getByTestId('reset-budget-input'), '5');
    expect(screen.getByText('Enter at least $10.00.')).toBeTruthy();
    expect(screen.getByTestId('reset-confirm').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Set budget to $500.00'));
    expect(screen.getByTestId('reset-budget-input').props.value).toBe('500');
    expect(screen.getByTestId('reset-confirm').props.accessibilityState?.disabled).toBe(false);
  });

  it('reset closes the old session with its stats and starts a new one (FR-S3, FR-S4, FR-S6)', async () => {
    const { db, seeded, setNow } = await openSessions();
    setNow('2026-11-09T10:00:00Z');
    await fireEvent.press(within(card(1)).getByText('Reset budget'));
    await fireEvent.changeText(screen.getByTestId('reset-budget-input'), '300');
    await fireEvent.press(screen.getByTestId('reset-confirm'));

    const r = repos(db);
    const [s2, s1] = r.sessions.list();
    expect(s1).toMatchObject({
      status: 'closed',
      endedAt: '2026-11-09T10:00:00.000Z',
      finalBankrollCents: 95_25,
      stats: expect.objectContaining({ bets: 5, open: 3, won: 1, lost: 1 }),
    });
    expect(s2).toMatchObject({ status: 'active', startingBudgetCents: 300_00 });
    expect(r.bankroll.current(s2!.id)).toBe(300_00);
    // Nothing deleted; the open bets stay in the closed session.
    expect(r.bets.listBySession(s1!.id).map((b) => b.id)).toEqual(seeded.map((b) => b.id));
    expect(r.bets.listBySession(s2!.id)).toEqual([]);
    expect(checkConsistency(db)).toEqual({ ok: true, issues: [] });

    expect(screen.getByTestId('toast')).toHaveTextContent('Session 1 archived · Session 2 started');
    expect(screen.queryByTestId('reset-confirm')).toBeNull();
    expect(label(2)).toBe(
      'Session 2, active, 9 Nov 2026 – today. Start $300.00, bankroll $300.00, ROI —, 0 bets',
    );
    expect(label(1)).toBe(
      'Session 1, closed, 9 Nov 2026. Start $100.00, final $95.25, ROI +6.4%, 5 bets',
    );
    expect(screen.getAllByText('Closed')).toHaveLength(2); // section header and pill
    expect(screen.getByText('View session 1 performance')).toBeTruthy();

    // The open bets are still listed under the old session in the Ledger.
    await fireEvent.press(screen.getByTestId('session-1-ledger'));
    for (const b of seeded) expect(screen.getByTestId(`ledger-row-${b.id}`)).toBeTruthy();
    expect(screen.getByTestId('filter-open')).toHaveTextContent(/3$/);
  });

  it('archived open bets still settle there and update the closed session ROI (FR-S6)', async () => {
    const { db, seeded, setNow } = await openSessions();
    await fireEvent.press(within(card(1)).getByText('Reset budget'));
    await fireEvent.press(screen.getByTestId('reset-confirm'));
    const r = repos(db);
    const active = r.sessions.getActive()!;

    setNow('2026-11-10T09:00:00Z');
    // Bayern v Dortmund: home pick at 4.20 wins.
    settleFromResults(db, [finished(seeded[2]!.matchId, 2, 0)], new Date('2026-11-10T09:00:00Z'));
    expect(r.bankroll.current(active.id)).toBe(100_00);
    expect(r.bets.getById(seeded[2]!.id)!.status).toBe('won');
    expect(checkConsistency(db)).toEqual({ ok: true, issues: [] });

    // Tab screens stay mounted: coming back to Sessions re-reads the database.
    await act(async () => {
      router.navigate('/ledger');
    });
    expect(screen.getByTestId('screen-ledger')).toBeTruthy();
    await act(async () => {
      router.navigate('/sessions');
    });
    // ROI now (2.08 - 1.80 + 3.58) / 5.52.
    expect(label(1)).toMatch(/final \$95\.25, ROI \+69\.9%, 5 bets$/);
  });

  it('Reset budget on a depleted Today opens the sheet directly (design 11)', async () => {
    await renderApp({ at: AT, budgetCents: 10_00 });
    await fireEvent.press(screen.getByTestId('reset-budget'));
    expect(screen.getByTestId('screen-sessions')).toBeTruthy();
    expect(screen.getByTestId('reset-confirm')).toBeTruthy();
    expect(screen.getByTestId('reset-bankroll')).toHaveTextContent('$10.00');
    await fireEvent.press(screen.getByTestId('reset-cancel'));
    expect(screen.queryByTestId('reset-confirm')).toBeNull();
  });
});
