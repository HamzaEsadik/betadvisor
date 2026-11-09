import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/src/test/render';
import { BankrollChart, chartGeometry } from '../BankrollChart';
import { BankrollHero } from '../BankrollHero';
import { LedgerRow } from '../LedgerRow';
import { SessionCard } from '../SessionCard';
import { SignalCard, selectionName } from '../SignalCard';
import { SkipRow } from '../SkipRow';
import { StatTile } from '../StatTile';
import { touchHeight } from './helpers';

const hidden = { includeHiddenElements: true } as const;

const SIGNAL = {
  home: 'Arsenal',
  away: 'Chelsea',
  homeCode: 'ARS',
  awayCode: 'CHE',
  league: 'Premier League',
  kickoff: 'Sat 15:00',
  selection: 'HOME' as const,
  odds: 2.1,
  stake: 224,
  model: 0.52,
  implied: 0.476,
  edge: 0.092,
};

describe('SignalCard', () => {
  it('shows teams, pick, odds, stake, edge and probabilities', async () => {
    await renderWithTheme(<SignalCard {...SIGNAL} />);
    for (const text of ['Arsenal', 'Chelsea', '2.10', '$2.24', 'Premier League · Sat 15:00']) {
      expect(screen.getAllByText(text, hidden).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('+9.2% edge', hidden)).toBeOnTheScreen();
    expect(screen.getByText('52%', hidden)).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Arsenal v Chelsea, Premier League, Sat 15:00. Pick Arsenal at 2.10, stake $2.24, +9.2% edge',
      ),
    ).toBeOnTheScreen();
  });

  it('is a button when pressable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<SignalCard {...SIGNAL} onPress={onPress} currency="€" />);
    const card = screen.getByRole('button');
    expect(card.props.accessibilityLabel).toContain('stake €2.24');
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a lock instead of the edge when frozen', async () => {
    await renderWithTheme(<SignalCard {...SIGNAL} frozen />);
    expect(screen.getByText('Frozen', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-lock', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('+9.2% edge', hidden)).toBeNull();
  });

  it('shows kickoff passed when expired', async () => {
    await renderWithTheme(<SignalCard {...SIGNAL} expired frozen />);
    expect(screen.getByText('Kickoff passed', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('Frozen', hidden)).toBeNull();
  });

  it('names the pick for each selection', () => {
    expect(selectionName('HOME', 'A', 'B')).toBe('A');
    expect(selectionName('DRAW', 'A', 'B')).toBe('Draw');
    expect(selectionName('AWAY', 'A', 'B')).toBe('B');
  });
});

describe('SkipRow', () => {
  it('shows the match and the reason', async () => {
    await renderWithTheme(
      <SkipRow home="Lyon" away="Nice" league="Ligue 1" kickoff="Sun 17:00" reason="No edge" />,
    );
    expect(
      screen.getByLabelText('Lyon v Nice, Ligue 1, Sun 17:00. Skipped: No edge'),
    ).toBeOnTheScreen();
    expect(screen.getByText('No edge', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('icon-chevron-right', hidden)).toBeNull();
  });

  it('is a 48 dp button with a chevron when pressable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <SkipRow
        home="Lyon"
        away="Nice"
        league="Ligue 1"
        kickoff="Sun"
        reason="Cap reached"
        onPress={onPress}
      />,
    );
    const row = screen.getByRole('button');
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
    expect(touchHeight(row)).toBeGreaterThanOrEqual(48);
    expect(screen.getByTestId('icon-chevron-right', hidden)).toBeOnTheScreen();
  });
});

describe('LedgerRow', () => {
  const base = {
    home: 'Arsenal',
    away: 'Chelsea',
    date: 'Sat 8 Nov',
    selection: 'Arsenal',
    odds: 2.1,
    stake: 224,
    bankroll: 10720,
  };

  it('shows a won bet with an up arrow, signed profit and the bankroll', async () => {
    await renderWithTheme(<LedgerRow {...base} status="won" profit={246} />);
    expect(screen.getByText('+$2.46', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Bankroll $107.20', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Sat 8 Nov · Arsenal @ 2.10 · stake $2.24', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-arrow-up', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-check', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-lock', hidden)).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/Won, profit \+\$2\.46, bankroll \$107\.20, frozen$/),
    ).toBeOnTheScreen();
  });

  it('shows a lost bet with a down arrow', async () => {
    await renderWithTheme(<LedgerRow {...base} status="lost" profit={-224} />);
    expect(screen.getByText('-$2.24', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-arrow-down', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-x', hidden)).toBeOnTheScreen();
  });

  it('shows a void bet as flat and an open bet with a dash', async () => {
    await renderWithTheme(<LedgerRow {...base} status="void" profit={0} />);
    expect(screen.getByText('$0.00', hidden)).toBeOnTheScreen();
    expect(screen.getAllByTestId('icon-minus', hidden)).toHaveLength(2);
    await renderWithTheme(<LedgerRow {...base} status="open" profit={null} frozen={false} />);
    expect(screen.getByText('—', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('icon-lock', hidden)).toBeNull();
    expect(screen.getByLabelText(/no result yet/)).toBeOnTheScreen();
  });
});

describe('StatTile', () => {
  it.each([
    ['win', 'icon-arrow-up', ', up'],
    ['loss', 'icon-arrow-down', ', down'],
  ] as const)('tone %s adds an arrow', async (tone, icon, spoken) => {
    await renderWithTheme(<StatTile label="ROI" value="+7.2%" tone={tone} hint="18 bets" />);
    expect(screen.getByTestId(icon, hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText(`ROI: +7.2%${spoken}. 18 bets`)).toBeOnTheScreen();
  });

  it('has no arrow without a tone', async () => {
    await renderWithTheme(<StatTile label="Bets" value="18" />);
    expect(screen.getByLabelText('Bets: 18')).toBeOnTheScreen();
    expect(screen.queryByTestId('icon-arrow-up', hidden)).toBeNull();
  });
});

describe('BankrollHero', () => {
  it('shows bankroll, profit and meta', async () => {
    await renderWithTheme(
      <BankrollHero bankroll={10720} profit={720} profitPct={0.072} openBets={3} start={10000} />,
    );
    expect(screen.getByText('$107.20', hidden)).toBeOnTheScreen();
    expect(screen.getByText('+$7.20 (+7.2%)', hidden)).toBeOnTheScreen();
    expect(screen.getByText('3 open · started with $100.00', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-arrow-up', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Bankroll \$107\.20, up/)).toBeOnTheScreen();
  });

  it('shows a loss with a down arrow and a custom label', async () => {
    await renderWithTheme(
      <BankrollHero
        label="Balance"
        bankroll={1520}
        profit={-8480}
        profitPct={-0.848}
        openBets={0}
        start={10000}
      />,
    );
    expect(screen.getByText('-$84.80 (-84.8%)', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-arrow-down', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Balance \$15\.20, down/)).toBeOnTheScreen();
  });
});

describe('SessionCard', () => {
  const base = {
    title: 'Session 2',
    dates: '3 Nov – today',
    startBudget: 10000,
    finalBankroll: 10720,
    bets: 18,
  };

  it('shows an active session with a reset button', async () => {
    const onReset = jest.fn();
    await renderWithTheme(<SessionCard {...base} status="active" roi={0.072} onReset={onReset} />);
    expect(screen.getByText('Active', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Bankroll', hidden)).toBeOnTheScreen();
    expect(screen.getByText('+7.2%', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('icon-arrow-up', hidden)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Reset budget' }));
    expect(onReset).toHaveBeenCalled();
    expect(
      screen.getByLabelText(
        'Session 2, active, 3 Nov – today. Start $100.00, bankroll $107.20, ROI +7.2%, 18 bets',
      ),
    ).toBeOnTheScreen();
  });

  it('shows a closed session without a reset button', async () => {
    await renderWithTheme(
      <SessionCard {...base} status="closed" roi={-0.083} onReset={jest.fn()} />,
    );
    expect(screen.getByText('Closed', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Final', hidden)).toBeOnTheScreen();
    expect(screen.getByText('-8.3%', hidden)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a dash when ROI is unknown', async () => {
    await renderWithTheme(<SessionCard {...base} status="active" roi={null} bets={0} />);
    expect(screen.getByText('—', hidden)).toBeOnTheScreen();
  });
});

describe('BankrollChart', () => {
  it('shows an empty state for 0 points', async () => {
    await renderWithTheme(<BankrollChart points={[]} start={10000} />);
    expect(screen.getByLabelText('Bankroll curve: No settled bets yet')).toBeOnTheScreen();
    expect(chartGeometry([], 10000, 320, 150)).toBeNull();
  });

  it('centres a single point and draws no drawdown', async () => {
    await renderWithTheme(<BankrollChart points={[10000]} start={10000} />);
    expect(screen.getByLabelText('Bankroll curve, from $100.00 to $100.00')).toBeOnTheScreen();
    expect(screen.queryByTestId('chart-drawdown', hidden)).toBeNull();
    const g = chartGeometry([10000], 10000, 320, 150)!;
    expect(g.last.x).toBe(160);
    expect(g.line).toMatch(/^M160\.0 /);
  });

  it('draws line, dashed base, drawdown band and labels', async () => {
    await renderWithTheme(
      <BankrollChart
        points={[10000, 11000, 9000, 9500]}
        start={10000}
        startLabel="3 Nov"
        endLabel="Now"
      />,
    );
    expect(screen.getByTestId('chart-drawdown', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('chart-base', hidden).props.strokeDasharray).toBeDefined();
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"content":"3 Nov"');
    expect(json).toContain('"content":"Now"');
    const g = chartGeometry([10000, 11000, 9000, 9500], 10000, 320, 150)!;
    // Peak at index 1, trough at index 2 of 4 points over a 304 px plot.
    expect(g.band!.x).toBeCloseTo(8 + 304 / 3);
    expect(g.band!.width).toBeCloseTo(304 / 3);
  });

  it('handles 500 points', async () => {
    const pts = Array.from({ length: 500 }, (_, i) => 10000 + Math.round(Math.sin(i / 20) * 2000));
    await renderWithTheme(<BankrollChart points={pts} start={10000} />);
    const g = chartGeometry(pts, 10000, 320, 150)!;
    expect(g.line.split('L')).toHaveLength(500);
    expect(screen.getByTestId('chart-line', hidden).props.d).toBeDefined();
    expect(g.last.x).toBeCloseTo(312);
  });

  it('draws no band on a rising curve and resizes to its layout', async () => {
    await renderWithTheme(<BankrollChart points={[10000, 10100, 10200]} start={10000} />);
    expect(screen.queryByTestId('chart-drawdown', hidden)).toBeNull();
    await fireEvent(screen.getByTestId('bankroll-chart'), 'layout', {
      nativeEvent: { layout: { width: 358, height: 150, x: 0, y: 0 } },
    });
    expect(JSON.stringify(screen.toJSON())).toContain('"vbWidth":358');
  });
});
