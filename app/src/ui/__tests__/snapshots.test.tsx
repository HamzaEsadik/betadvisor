import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';

import { renderWithTheme } from '@/src/test/render';
import {
  AppBar,
  BankrollChart,
  BankrollHero,
  Banner,
  BottomSheet,
  BudgetInput,
  Button,
  Chip,
  EdgeBadge,
  FormStrip,
  LedgerRow,
  ProbabilityBar,
  SessionCard,
  SignalCard,
  SkipRow,
  StatTile,
  StatusPill,
  TabBar,
  TeamBadge,
} from '..';

const SIGNAL = {
  home: 'Arsenal',
  away: 'Chelsea',
  league: 'Premier League',
  kickoff: 'Sat 15:00',
  selection: 'HOME' as const,
  odds: 2.1,
  stake: 224,
  model: 0.52,
  implied: 0.476,
  edge: 0.092,
};

/** One representative element per component (the gallery covers every state). */
const CASES: Record<string, ReactElement> = {
  Button: (
    <Button icon="rotate-ccw" variant="secondary">
      Reset budget
    </Button>
  ),
  Chip: (
    <Chip selected count={3}>
      Today
    </Chip>
  ),
  StatusPill: <StatusPill status="won" />,
  EdgeBadge: <EdgeBadge edge={0.092} />,
  TeamBadge: <TeamBadge code="ARS" size="md" />,
  FormStrip: <FormStrip form="WDL" />,
  ProbabilityBar: <ProbabilityBar model={0.52} book={0.476} />,
  SignalCard: <SignalCard {...SIGNAL} frozen />,
  SkipRow: <SkipRow home="Lyon" away="Nice" league="Ligue 1" kickoff="Sun" reason="No edge" />,
  LedgerRow: (
    <LedgerRow
      home="Arsenal"
      away="Chelsea"
      date="Sat 8 Nov"
      selection="Arsenal"
      odds={2.1}
      stake={224}
      status="lost"
      profit={-224}
      bankroll={10496}
    />
  ),
  StatTile: <StatTile label="ROI" value="+7.2%" tone="win" hint="18 bets" />,
  BankrollHero: (
    <BankrollHero bankroll={10720} profit={720} profitPct={0.072} openBets={3} start={10000} />
  ),
  BankrollChart: <BankrollChart points={[10000, 11000, 9000, 9500]} start={10000} />,
  Banner: (
    <Banner tone="warn" title="Stale" action="Retry">
      Old data
    </Banner>
  ),
  TabBar: (
    <TabBar
      items={[
        { key: 'a', label: 'Today', icon: 'calendar-days' },
        { key: 'b', label: 'More', icon: 'settings' },
      ]}
      active="a"
    />
  ),
  AppBar: <AppBar title="Bet detail" onBack={() => undefined} />,
  SessionCard: (
    <SessionCard
      title="Session 1"
      status="closed"
      dates="12 Oct – 2 Nov"
      startBudget={5000}
      finalBankroll={4120}
      roi={-0.083}
      bets={24}
    />
  ),
  BudgetInput: <BudgetInput value="5" error="Minimum budget is $10.00" presets={[50, 100]} />,
  BottomSheet: (
    <BottomSheet visible onClose={() => undefined} title="Reset budget">
      <RNText>Body</RNText>
    </BottomSheet>
  ),
};

describe.each(['dark', 'light'] as const)('%s theme', (mode) => {
  it.each(Object.keys(CASES))('%s matches its snapshot', async (name) => {
    await renderWithTheme(CASES[name]!, mode);
    expect(screen.toJSON()).toMatchSnapshot();
  });
});
