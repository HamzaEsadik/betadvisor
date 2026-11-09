import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { ThemeProvider, useTheme, type Scheme } from '@/src/theme';
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
  ICON_NAMES,
  Icon,
  LedgerRow,
  ProbabilityBar,
  Screen,
  SessionCard,
  SignalCard,
  SkipRow,
  StatTile,
  StatusPill,
  TabBar,
  TeamBadge,
  Text,
  type BetStatus,
} from '@/src/ui';

const noop = () => undefined;

/** A 500-point random walk with a clear drawdown, for the chart. */
function walk(n: number): number[] {
  const pts: number[] = [];
  let v = 10000;
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    v += Math.round((seed / 2147483647 - 0.5) * 300) + (i > n * 0.4 && i < n * 0.6 ? -60 : 10);
    pts.push(Math.max(v, 100));
  }
  return pts;
}
const LONG_CURVE = walk(500);
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
const STATUSES: BetStatus[] = ['open', 'won', 'lost', 'void', 'review'];
const TABS = [
  { key: 'today', label: 'Today', icon: 'calendar-days' as const },
  { key: 'ledger', label: 'Ledger', icon: 'list-ordered' as const },
  { key: 'performance', label: 'Performance', icon: 'chart-line' as const },
  { key: 'sessions', label: 'Sessions', icon: 'layers' as const },
  { key: 'more', label: 'More', icon: 'settings' as const },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text variant="overline" color="inkSubtle">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** Every component in every state, in the current theme. */
export function GallerySection() {
  const theme = useTheme();
  const [budget, setBudget] = useState('100');
  const [tab, setTab] = useState('today');
  const [chip, setChip] = useState('Today');
  const [sheet, setSheet] = useState(false);
  return (
    <View
      testID={`gallery-${theme.scheme}`}
      style={{ backgroundColor: theme.colors.bg, padding: theme.space[4], gap: theme.space[6] }}
    >
      <Text variant="titleLg">{theme.scheme === 'dark' ? 'Dark' : 'Light'}</Text>
      <Section title="Icon">
        <Row>
          {ICON_NAMES.map((n) => (
            <Icon key={n} name={n} />
          ))}
        </Row>
      </Section>
      <Section title="Button">
        <Button onPress={noop}>Follow advice</Button>
        <Button variant="secondary" icon="rotate-ccw" onPress={noop}>
          Reset budget
        </Button>
        <Button variant="ghost" onPress={noop}>
          Ghost
        </Button>
        <Button size="sm" onPress={noop}>
          Small
        </Button>
        <Button full disabled>
          Disabled
        </Button>
      </Section>
      <Section title="Chip">
        <Row>
          {['Yesterday', 'Today', 'Tomorrow'].map((c) => (
            <Chip key={c} selected={chip === c} onPress={() => setChip(c)}>
              {c}
            </Chip>
          ))}
          <Chip count={12}>All</Chip>
        </Row>
      </Section>
      <Section title="StatusPill / EdgeBadge / TeamBadge">
        <Row>
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </Row>
        <Row>
          <EdgeBadge edge={0.092} />
          <TeamBadge code="ARS" />
          <TeamBadge name="Real Madrid" size="md" />
        </Row>
      </Section>
      <Section title="FormStrip / ProbabilityBar">
        <FormStrip form="WWDLW" label="Arsenal" />
        <ProbabilityBar model={0.52} book={0.476} />
        <ProbabilityBar model={0.31} book={0.28} compact />
      </Section>
      <Section title="SignalCard">
        <SignalCard {...SIGNAL} onPress={noop} />
        <SignalCard {...SIGNAL} selection="DRAW" frozen />
        <SignalCard {...SIGNAL} selection="AWAY" expired />
      </Section>
      <Section title="SkipRow">
        <SkipRow home="Lyon" away="Nice" league="Ligue 1" kickoff="Sun 17:00" reason="No edge" />
        <SkipRow
          home="Bayern"
          away="Dortmund"
          league="Bundesliga"
          kickoff="Sat 18:30"
          reason="Cap reached"
          onPress={noop}
        />
      </Section>
      <Section title="LedgerRow">
        {STATUSES.map((s) => (
          <LedgerRow
            key={s}
            home="Arsenal"
            away="Chelsea"
            date="Sat 8 Nov"
            selection="Arsenal"
            odds={2.1}
            stake={224}
            status={s}
            profit={s === 'won' ? 246 : s === 'lost' ? -224 : s === 'void' ? 0 : null}
            bankroll={10720}
          />
        ))}
      </Section>
      <Section title="StatTile">
        <Row>
          <StatTile label="ROI" value="+7.2%" tone="win" hint="18 bets" />
          <StatTile label="Drawdown" value="-12.4%" tone="loss" />
          <StatTile label="Hit rate" value="44%" />
        </Row>
      </Section>
      <Section title="BankrollHero">
        <BankrollHero bankroll={10720} profit={720} profitPct={0.072} openBets={3} start={10000} />
        <BankrollHero
          bankroll={1520}
          profit={-8480}
          profitPct={-0.848}
          openBets={0}
          start={10000}
        />
      </Section>
      <Section title="BankrollChart (0, 1, 8 and 500 points)">
        <BankrollChart points={[]} start={10000} />
        <BankrollChart points={[10000]} start={10000} />
        <BankrollChart
          points={[10000, 10246, 10022, 9800, 9650, 10100, 10500, 10720]}
          start={10000}
          startLabel="3 Nov"
        />
        <BankrollChart points={LONG_CURVE} start={10000} />
      </Section>
      <Section title="Banner">
        <Banner tone="warn" title="Data is 26 hours old" action="Retry" onAction={noop}>
          Following is paused until the feed updates.
        </Banner>
        <Banner tone="info">You are offline. Showing saved data.</Banner>
        <Banner tone="neutral" title="No bets today">
          The model found no edge in today&apos;s matches.
        </Banner>
      </Section>
      <Section title="TabBar / AppBar">
        <TabBar items={TABS} active={tab} onChange={setTab} />
        <AppBar
          title="Today"
          subtitle="Sun 9 Nov"
          large
          actions={[{ icon: 'bell', label: 'Notifications' }]}
        />
        <AppBar title="Bet detail" onBack={noop} />
      </Section>
      <Section title="SessionCard">
        <SessionCard
          title="Session 2"
          status="active"
          dates="3 Nov – today"
          startBudget={10000}
          finalBankroll={10720}
          roi={0.072}
          bets={18}
          onReset={() => setSheet(true)}
        />
        <SessionCard
          title="Session 1"
          status="closed"
          dates="12 Oct – 2 Nov"
          startBudget={5000}
          finalBankroll={4120}
          roi={-0.083}
          bets={24}
        />
      </Section>
      <Section title="BudgetInput">
        <BudgetInput value={budget} presets={[50, 100, 300, 1000]} onChange={setBudget} />
        <BudgetInput value="5" error="Minimum budget is $10.00" />
      </Section>
      <Section title="BottomSheet">
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Open sheet
        </Button>
        <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Reset budget">
          <Text color="inkMuted">The current session closes and a new one starts.</Text>
          <Button full onPress={() => setSheet(false)}>
            Close
          </Button>
        </BottomSheet>
      </Section>
    </View>
  );
}

/** Dark and light galleries, one after the other. */
export function Gallery({ schemes = ['dark', 'light'] }: { schemes?: Scheme[] }) {
  return (
    <Screen testID="gallery">
      <ScrollView>
        {schemes.map((s) => (
          <ThemeProvider key={s} initialMode={s}>
            <GallerySection />
          </ThemeProvider>
        ))}
      </ScrollView>
    </Screen>
  );
}
