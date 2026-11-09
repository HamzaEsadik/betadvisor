/** Part 14: More (design 06) and Settings (design 07). */
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { repos } from '@/src/db/repos';
import { darkColors, lightColors } from '@/src/theme';
import { readPrefs } from '../settings/prefs';
import { renderApp } from './harness';

const AT = '2026-11-09T09:00:00Z';
const BAY = '2026-11-09_BL1_BAY-BVB_1X2_AWAY';
const ARS = '2026-11-09_PL_ARS-CHE_1X2_HOME';
const RMA = '2026-11-09_PD_RMA-VAL_1X2_HOME';

async function go(path: '/more' | '/more/settings' | '/') {
  await act(async () => {
    router.navigate(path);
  });
}

async function openSettings(budgetCents = 107_20) {
  const app = await renderApp({ at: AT, budgetCents });
  await go('/more');
  await fireEvent.press(screen.getByTestId('more-settings'));
  expect(screen.getByTestId('screen-settings')).toBeTruthy();
  return app;
}

async function choose(row: string, option: string) {
  await fireEvent.press(screen.getByTestId(row));
  await fireEvent.press(screen.getByTestId(`option-${option}`));
}

const bg = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor as string;

describe('More', () => {
  it('links to Settings and About and shows the version line (design 06)', async () => {
    await renderApp({ at: AT, budgetCents: 100_00 });
    await go('/more');
    expect(screen.getByTestId('more-version')).toHaveTextContent(
      'BetAdvisor 0.1.0 · model dc-elo-0.1.0',
    );
    expect(screen.getByText('Virtual money. Results do not predict real outcomes.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('more-about'));
    expect(screen.getByTestId('screen-about')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByTestId('screen-more')).toBeTruthy();
  });
});

describe('Settings', () => {
  it('shows the design 07 defaults', async () => {
    await openSettings();
    expect(screen.getByTestId('row-per-bet-cap')).toHaveTextContent(/5% of bankroll/);
    expect(screen.getByTestId('row-daily-cap')).toHaveTextContent(/15% of bankroll/);
    expect(screen.getByTestId('row-min-stake')).toHaveTextContent(/\$1\.00/);
    expect(screen.getByTestId('row-notification-time')).toHaveTextContent(/07:30/);
    expect(screen.getByTestId('row-currency')).toHaveTextContent(/\$ \(display only\)/);
    expect(screen.getByTestId('row-theme')).toHaveTextContent(/Match system/);
    expect(screen.getByTestId('row-refresh')).toHaveTextContent(/Last updated today 09:00/);
    expect(screen.getByTestId('caps-note')).toHaveTextContent(
      'Caps apply to advice from the next day. Frozen bets never change.',
    );
    expect(screen.getByTestId('switch-notifications').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('switch-choose').props.accessibilityState.checked).toBe(false);
  });

  it('changing caps never changes frozen bets, and today keeps its caps (AC-6, design 07)', async () => {
    const app = await openSettings();
    await go('/');
    await fireEvent.press(screen.getByTestId('follow-advice'));
    const frozen = app.bets();
    expect(frozen.map((b) => b.stakeCents)).toEqual([167, 112, 224]);

    await go('/more/settings');
    await choose('row-per-bet-cap', '0.01');
    await choose('row-daily-cap', '0.05');
    await choose('row-min-stake', '200');
    expect(screen.getByTestId('row-per-bet-cap')).toHaveTextContent(/1% of bankroll/);
    expect(screen.getByTestId('caps-note')).toHaveTextContent(
      "New caps apply from Tue 10 Nov. Today's advice keeps 5% per bet, 15% per day and a $1.00 minimum. Frozen bets never change.",
    );

    // Frozen bets: same rows, same values (NFR-I1).
    expect(app.bets()).toEqual(frozen);
    const session = repos(app.db).sessions.getActive()!;
    expect(session.settings).toEqual({ perBetCap: 0.05, dailyCap: 0.15, minStakeCents: 100 });
    expect(session.nextSettings).toEqual({
      from: '2026-11-10T00:00:00.000Z',
      settings: { perBetCap: 0.01, dailyCap: 0.05, minStakeCents: 200 },
    });

    // Today still shows the frozen stakes.
    await go('/');
    expect(within(screen.getByTestId(`card-${ARS}`)).getByText('$2.24')).toBeTruthy();
    expect(within(screen.getByTestId(`card-${BAY}`)).getByText('$1.12')).toBeTruthy();
    expect(screen.getByTestId('footer-summary')).toHaveTextContent(
      '3 bets followed · stakes frozen',
    );
  });

  it("today's advice keeps today's caps after a change", async () => {
    await openSettings();
    await choose('row-per-bet-cap', '0.01');
    await go('/');
    expect(within(screen.getByTestId(`card-${ARS}`)).getByText('$2.24')).toBeTruthy();
    expect(screen.getByTestId('footer-summary')).toHaveTextContent('3 bets · $5.03 total stake');
  });

  it('cap options that conflict are disabled', async () => {
    await openSettings();
    await fireEvent.press(screen.getByTestId('row-daily-cap'));
    expect(screen.getByTestId('option-0.05').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('option-0.05'));
    await fireEvent.press(screen.getByTestId('row-per-bet-cap'));
    expect(screen.getByTestId('option-0.1').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('option-0.05').props.accessibilityState.checked).toBe(true);
  });

  it('the theme switch updates the tokens and is saved', async () => {
    const app = await openSettings();
    expect(bg('screen-settings')).toBe(darkColors.bg);
    await choose('row-theme', 'light');
    expect(bg('screen-settings')).toBe(lightColors.bg);
    expect(screen.getByTestId('row-theme')).toHaveTextContent(/Light/);
    expect(readPrefs(app.db).theme).toBe('light');
    await go('/');
    expect(bg('screen-today')).toBe(lightColors.bg);
    await go('/more/settings');
    await choose('row-theme', 'dark');
    expect(bg('screen-settings')).toBe(darkColors.bg);
  });

  it('the currency symbol changes how amounts are shown (display only)', async () => {
    const app = await openSettings();
    await choose('row-currency', '€');
    expect(screen.getByTestId('row-currency')).toHaveTextContent(/€ \(display only\)/);
    await go('/');
    expect(screen.getByText('€107.20')).toBeTruthy();
    expect(screen.getByTestId('footer-summary')).toHaveTextContent('3 bets · €5.03 total stake');
    expect(app.bankroll()).toBe(107_20);
  });

  it('reminder settings are saved', async () => {
    const app = await openSettings();
    await choose('row-notification-time', '06:30');
    expect(screen.getByTestId('row-notification-time')).toHaveTextContent(/06:30/);
    await fireEvent.press(screen.getByTestId('switch-notifications'));
    expect(screen.getByTestId('row-notification-time').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(readPrefs(app.db)).toMatchObject({
      notificationsEnabled: false,
      notificationTime: '06:30',
    });
  });

  it('Refresh data fetches the feed and shows the time', async () => {
    const app = await openSettings();
    app.setNow('2026-11-09T10:15:00Z');
    await fireEvent.press(screen.getByTestId('row-refresh'));
    expect(await screen.findByText('Data updated')).toBeTruthy();
    expect(screen.getByTestId('row-refresh')).toHaveTextContent(/Last updated today 10:15/);
  });

  it('FR-B5: choosing bets individually follows only the chosen ones', async () => {
    const app = await openSettings();
    await fireEvent.press(screen.getByTestId('switch-choose'));
    expect(readPrefs(app.db).chooseIndividually).toBe(true);
    await go('/');
    expect(screen.getByTestId('follow-advice')).toHaveTextContent('Follow 3 selected');
    await fireEvent.press(screen.getByTestId(`include-${RMA}`));
    expect(screen.getByTestId(`include-${RMA}`).props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('footer-summary')).toHaveTextContent(
      '2 of 3 bets · $3.36 total stake',
    );
    await fireEvent.press(screen.getByTestId('follow-advice'));
    expect(app.bets().map((b) => [b.signalId, b.stakeCents])).toEqual([
      [BAY, 112],
      [ARS, 224],
    ]);
    // The one left out can still be followed later, with the same stake.
    expect(screen.getByTestId('follow-advice')).toHaveTextContent('Follow 1 selected');
    await fireEvent.press(screen.getByTestId(`include-${RMA}`));
    expect(screen.getByTestId('follow-advice').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId(`include-${RMA}`));
    await fireEvent.press(screen.getByTestId('follow-advice'));
    expect(app.bets().find((b) => b.signalId === RMA)?.stakeCents).toBe(167);
  });
});
