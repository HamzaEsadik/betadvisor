/**
 * Part 12 integration tests: real routes, the in-memory database and the `feed-samples`
 * scenarios. Time zone UTC; `reference_now` of each scenario from `feed-samples/manifest.json`.
 */
import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { router } from 'expo-router';

import { sample } from '@/src/api/testServer';
import { followAdvice } from '@/src/db/services';
import { utc } from '@/src/db/testUtils';
import { renderApp } from './harness';

const AT = '2026-11-09T09:00:00Z';
const BAY = '2026-11-09_BL1_BAY-BVB_1X2_AWAY';
const ARS = '2026-11-09_PL_ARS-CHE_1X2_HOME';
const RMA = '2026-11-09_PD_RMA-VAL_1X2_HOME';

const followButton = () => screen.getByTestId('follow-advice');
const isDisabled = (el: ReturnType<typeof followButton>) =>
  el.props.accessibilityState?.disabled === true;

describe('first launch', () => {
  it('shows Setup when there is no session', async () => {
    await renderApp({ at: AT });
    expect(screen.getByTestId('screen-setup')).toBeTruthy();
    expect(screen.getByText('Start with a virtual budget')).toBeTruthy();
    expect(screen.queryByTestId('screen-today')).toBeNull();
  });

  it('shows the design 08 error for a budget below $10 and keeps Start disabled', async () => {
    await renderApp({ at: AT });
    await fireEvent.changeText(screen.getByTestId('budget-input'), '5');
    expect(screen.getByText('Enter at least $10.00.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('disclaimer-checkbox'));
    expect(isDisabled(screen.getByTestId('start-session'))).toBe(true);
  });

  it.each([
    ['', 'Enter a starting budget.'],
    ['abc', 'Enter a number, like 100 or 250.50.'],
    ['10.555', 'Use at most 2 decimals.'],
    ['2000000', 'Enter at most $1,000,000.00.'],
  ])('budget %j shows %j', async (value, message) => {
    await renderApp({ at: AT });
    await fireEvent.changeText(screen.getByTestId('budget-input'), value);
    expect(screen.getByText(message)).toBeTruthy();
  });

  it('gates Start on the disclaimer checkbox', async () => {
    await renderApp({ at: AT });
    expect(isDisabled(screen.getByTestId('start-session'))).toBe(true);
    const box = screen.getByTestId('disclaimer-checkbox');
    await fireEvent.press(box);
    expect(box.props.accessibilityState).toEqual({ checked: true });
    expect(isDisabled(screen.getByTestId('start-session'))).toBe(false);
  });

  it('presets fill the budget', async () => {
    await renderApp({ at: AT });
    await fireEvent.press(screen.getByLabelText('Set budget to $300.00'));
    expect(screen.getByTestId('budget-input').props.value).toBe('300');
  });

  it('Start creates the session and opens Today with the design 02 stakes', async () => {
    const app = await renderApp({ at: AT });
    await fireEvent.changeText(screen.getByTestId('budget-input'), '107.20');
    await fireEvent.press(screen.getByTestId('disclaimer-checkbox'));
    await fireEvent.press(screen.getByTestId('start-session'));

    expect(await screen.findByTestId('screen-today')).toBeTruthy();
    expect(app.bankroll()).toBe(107_20);
    expect(screen.getByText('$107.20')).toBeTruthy();
    expect(within(screen.getByTestId(`card-${BAY}`)).getByText('$1.12')).toBeTruthy();
    expect(within(screen.getByTestId(`card-${ARS}`)).getByText('$2.24')).toBeTruthy();
    expect(within(screen.getByTestId(`card-${RMA}`)).getByText('$1.67')).toBeTruthy();
    expect(screen.getByTestId('recommended-summary')).toHaveTextContent(
      '3 bets · 4.7% of bankroll',
    );
    expect(screen.getByTestId('footer-summary')).toHaveTextContent('3 bets · $5.03 total stake');
  });
});

describe('Today', () => {
  it('lists the feed skips with their reasons and the updated footer', async () => {
    await renderApp({ at: AT, budgetCents: 107_20 });
    expect(screen.getByText('Skipped today')).toBeTruthy();
    expect(screen.getByText('5 matches')).toBeTruthy();
    for (const reason of [
      'Below threshold',
      'No edge',
      'Odds out of range',
      'Missing data',
      'Low confidence',
    ]) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
    expect(screen.getByTestId('updated-footer')).toHaveTextContent(
      'Updated Today 07:00 · model dc-elo-0.1.0',
    );
  });

  it('Follow advice freezes the cards, reduces the bankroll and confirms', async () => {
    const app = await renderApp({ at: AT, budgetCents: 107_20 });
    expect(isDisabled(followButton())).toBe(false);
    await fireEvent.press(followButton());

    expect(app.bets().map((b) => [b.signalId, b.stakeCents])).toEqual([
      [RMA, 167],
      [BAY, 112],
      [ARS, 224],
    ]);
    expect(app.bankroll()).toBe(102_17);
    expect(screen.getByTestId('toast')).toHaveTextContent('Followed 3 bets · $5.03 frozen');
    expect(screen.getByText('Available $102.17 · 3 open')).toBeTruthy();
    expect(screen.getByText('$102.17')).toBeTruthy();
    for (const id of [BAY, ARS, RMA]) {
      expect(within(screen.getByTestId(`card-${id}`)).getByText('Frozen')).toBeTruthy();
    }
    expect(screen.queryByTestId('follow-advice')).toBeNull();
    expect(screen.getByTestId('footer-summary')).toHaveTextContent(
      '3 bets followed · stakes frozen',
    );
  });

  it('following twice creates no duplicates', async () => {
    const app = await renderApp({ at: AT, budgetCents: 107_20 });
    const button = followButton();
    await fireEvent.press(button);
    await fireEvent.press(button);
    const again = followAdvice(app.db, app.store.getState().signals!.signals, new Date(AT), utc);
    expect(again.frozen).toHaveLength(0);
    expect(app.bets()).toHaveLength(3);
    expect(app.bankroll()).toBe(102_17);
  });

  it('a passed kickoff shows the card as expired and it is not followed (FR-A10)', async () => {
    const app = await renderApp({ at: '2026-11-09T16:00:00Z', budgetCents: 107_20 });
    expect(within(screen.getByTestId(`card-${RMA}`)).getByText('Kickoff passed')).toBeTruthy();
    expect(screen.getByTestId('footer-summary')).toHaveTextContent('2 bets · $3.36 total stake');
    await fireEvent.press(followButton());
    expect(app.bets().map((b) => b.signalId)).toEqual([BAY, ARS]);
  });

  it('stale data shows the design 09 banner and disables Follow advice', async () => {
    const app = await renderApp({ feed: 'stale', at: AT, budgetCents: 107_20 });
    expect(screen.getByTestId('banner-stale')).toHaveTextContent(
      /Data is 26 hours old\. Stakes may not match current odds\./,
    );
    expect(isDisabled(followButton())).toBe(true);
    expect(screen.getByTestId('footer-summary')).toHaveTextContent(
      '1 bet · $1.68 total stake · Updated yesterday 07:00',
    );
    await fireEvent.press(followButton());
    expect(app.bets()).toHaveLength(0);
  });

  it('a feed with no signals shows the design 10 empty state and the notice', async () => {
    await renderApp({ feed: 'no-signals', at: AT, budgetCents: 100_00 });
    expect(screen.getByTestId('empty-state')).toHaveTextContent(/No recommended bets today/);
    expect(
      screen.getByText('International break: no league matches in the next 48 hours.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('follow-advice')).toBeNull();
  });

  it('before the first fetch it asks to pull to refresh', async () => {
    await renderApp({ at: AT, budgetCents: 100_00, prefetch: false });
    expect(screen.getByTestId('empty-state')).toHaveTextContent(/No data yet/);
  });

  it('a depleted bankroll shows the design 11 banner and a Reset action', async () => {
    const app = await renderApp({ at: AT, budgetCents: 10_00 });
    expect(screen.getByTestId('banner-depleted')).toHaveTextContent(
      /Every stake would now fall below the \$1.00 minimum/,
    );
    expect(screen.queryByTestId('follow-advice')).toBeNull();
    expect(screen.getAllByText('Stake below minimum')).toHaveLength(3);
    await fireEvent.press(screen.getByTestId('reset-budget'));
    expect(app.result.getPathname()).toBe('/sessions');
  });

  it('Tomorrow is a read-only preview and Yesterday lists frozen bets', async () => {
    await renderApp({ at: AT, budgetCents: 107_20 });
    await fireEvent.press(screen.getByLabelText('Tomorrow'));
    expect(screen.getByTestId('card-2026-11-10_FL1_PSG-ASM_1X2_HOME')).toBeTruthy();
    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.queryByTestId('follow-advice')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Yesterday'));
    expect(screen.getByTestId('empty-state')).toHaveTextContent(/No bets followed yesterday/);
  });

  it('pull to refresh fetches the feed again', async () => {
    const app = await renderApp({ at: AT, budgetCents: 107_20 });
    const before = app.server.requests.length;
    const scroll = screen.getByTestId('today-scroll');
    await act(async () => {
      scroll.props.refreshControl.props.onRefresh();
    });
    expect(app.server.requests.length).toBe(before + 3);
  });
});

describe('Bet detail', () => {
  it('opens from a card and explains the pick (design 12)', async () => {
    const app = await renderApp({ at: AT, budgetCents: 107_20 });
    await fireEvent.press(screen.getByTestId(`card-${ARS}`));
    expect(app.result.getPathname()).toBe(`/signal/${ARS}`);
    expect(screen.getByTestId('screen-signal')).toBeTruthy();
    expect(screen.getByText('Premier League')).toBeTruthy();
    expect(screen.getByText('Today · 20:00')).toBeTruthy();
    expect(screen.getByTestId('pick')).toHaveTextContent('Arsenal to win');
    expect(screen.getByTestId('edge-formula')).toHaveTextContent(
      /0\.52 × 2\.10 − 1 = \+9\.2%\. The bookmaker figure has the margin removed/,
    );
    expect(screen.getByLabelText('Stake: $2.24. 2.1% of bankroll')).toBeTruthy();
    expect(screen.getByLabelText('Odds: 2.10. Snapshot 06:55')).toBeTruthy();
    expect(screen.getByTestId('availability-home')).toHaveTextContent('None reported');
    expect(screen.getByTestId('availability-away')).toHaveTextContent('Player B (out)');
    expect(screen.getByText('Not confirmed')).toBeTruthy();
    expect(screen.getByTestId('why')).toHaveTextContent(/Model rates Arsenal higher/);
    expect(screen.getByTestId('lock-note')).toHaveTextContent(/Not frozen yet/);
  });

  it('shows unknown availability and the skip reason for a skipped match', async () => {
    await renderApp({ at: AT, budgetCents: 107_20 });
    await fireEvent.press(screen.getByTestId('skip-2026-11-09_PL_BRE-FUL_1X2_AWAY'));
    expect(screen.getByTestId('availability-home')).toHaveTextContent(
      'Unknown, source unavailable',
    );
    expect(screen.getByLabelText('Stake: —. Missing data')).toBeTruthy();
  });

  it('shows the frozen values and the lock note after following', async () => {
    await renderApp({ at: AT, budgetCents: 107_20 });
    await fireEvent.press(followButton());
    await fireEvent.press(screen.getByTestId(`card-${BAY}`));
    expect(screen.getByTestId('lock-note')).toHaveTextContent(
      /Locked when you followed advice at 09:00/,
    );
    expect(screen.getByLabelText('Stake: $1.12. 1.0% of bankroll')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByTestId('screen-today')).toBeTruthy();
  });

  it('a frozen bet keeps its values when a newer signal version arrives (AC-6)', async () => {
    const app = await renderApp({
      feed: {
        signals: sample('versioned/signals.v1.json'),
        results: sample('versioned/results.json'),
        meta: sample('versioned/meta.json'),
      },
      at: '2026-11-09T12:00:00Z',
      budgetCents: 100_00,
    });
    await fireEvent.press(followButton());
    const frozen = app.bets().find((b) => b.signalId === ARS)!;
    expect(frozen.odds).toBe(2.1);

    app.server.serve('signals', sample('versioned/signals.v2.json'));
    app.setNow('2026-11-09T14:00:00Z');
    await act(async () => {
      await app.store.refresh();
    });
    expect(within(screen.getByTestId(`card-${ARS}`)).getByText('2.10')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`card-${ARS}`));
    expect(screen.getByLabelText('Odds: 2.10. Frozen 12:00')).toBeTruthy();
    expect(screen.getByTestId('lock-note')).toHaveTextContent(
      /The feed now has version 2; this bet keeps version 1/,
    );
  });

  it('an unknown id shows a not-found note', async () => {
    const app = await renderApp({ at: AT, budgetCents: 107_20 });
    await act(async () => {
      app.result.getRouterState();
    });
    await act(async () => {
      router.push('/signal/nope');
    });
    expect(screen.getByText('This match is no longer in the feed.')).toBeTruthy();
  });
});
