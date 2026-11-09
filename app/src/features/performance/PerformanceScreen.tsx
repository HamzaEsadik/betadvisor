/** Performance (design 14): FR-P1 to FR-P7. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { formatMoney, formatSignedMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import {
  AppBar,
  BankrollChart,
  Banner,
  Chip,
  Icon,
  Screen,
  StatTile,
  Text,
  format,
  type StatTileProps,
} from '@/src/ui';
import type { GroupProfit } from '@/src/domain/metrics';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { useFocusRevision } from '../common/useFocusRevision';
import { dateLabel } from '../time';
import {
  listing,
  loadPerformance,
  MARKET_LABELS,
  SMALL_SAMPLE_BETS,
  type Performance,
} from './model';

const toneOf = (x: number): StatTileProps['tone'] => (x > 0 ? 'win' : x < 0 ? 'loss' : undefined);

export function PerformanceScreen() {
  const s = useStyles();
  const router = useRouter();
  const { db, offsetOf, currency, revision } = useAppEnv();
  const params = useLocalSearchParams<{ session?: string }>();
  const focused = useFocusRevision();
  const wanted = params.session === undefined ? null : Number(params.session);
  const data = useMemo(
    () => loadPerformance(db, wanted, offsetOf),
    // `revision` signals a database write; focus re-reads settlements made elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, wanted, offsetOf, revision, focused],
  );
  if (data === null) return null;

  return (
    <Screen testID="screen-performance">
      <AppBar title="Performance" large />
      <ScrollView contentContainerStyle={s.body}>
        <ScrollView horizontal contentContainerStyle={s.chips} accessibilityRole="tablist">
          {data.choices.map((c) => (
            <Chip
              key={c.id}
              testID={`perf-session-${c.number}`}
              selected={c.id === data.session.id}
              onPress={() => router.setParams({ session: c.active ? undefined : String(c.id) })}
            >
              {c.active ? `Session ${c.number} · active` : `Session ${c.number}`}
            </Chip>
          ))}
        </ScrollView>
        <Body data={data} currency={currency} />
      </ScrollView>
    </Screen>
  );
}

function Body({ data, currency }: { data: Performance; currency: string }) {
  const s = useStyles();
  const money = (c: number) => formatMoney(c, currency);
  const { summary, settled, drawdown, interval, clv } = data;
  const start = data.session.startingBudgetCents;
  const pl = summary.profitCents;
  const active = data.session.status === 'active';
  const range = active
    ? `${dateLabel(data.startDay, false)} to today`
    : `${dateLabel(data.startDay, false)} to ${dateLabel(data.endDay!, false)}`;

  const tiles: (StatTileProps & { key: string })[] = [
    {
      key: 'bankroll',
      label: active ? 'Bankroll' : 'Final bankroll',
      value: money(data.bankrollCents),
      hint: `Start ${money(start)}`,
    },
    {
      key: 'pl',
      label: 'Profit / loss',
      value: formatSignedMoney(pl, currency),
      tone: toneOf(pl),
      hint: 'Settled bets',
    },
    {
      key: 'roi',
      label: 'ROI',
      value: summary.roi === null ? '—' : format.signedPct(summary.roi, 1),
      tone: summary.roi === null ? undefined : toneOf(summary.roi),
      hint: `${settled} settled ${settled === 1 ? 'bet' : 'bets'}`,
    },
    {
      key: 'hit',
      label: 'Hit rate',
      value: summary.hitRate === null ? '—' : format.pct(summary.hitRate),
      hint: `${summary.won} won / ${summary.lost} lost`,
    },
    {
      key: 'bets',
      label: 'Bets',
      value: String(summary.bets),
      hint: `${summary.open} open · ${summary.void} void`,
    },
    {
      key: 'dd',
      label: 'Max drawdown',
      value: drawdown.amountCents === 0 ? money(0) : money(-drawdown.amountCents),
      tone: drawdown.amountCents > 0 ? 'loss' : undefined,
      hint: drawdown.amountCents > 0 ? `${format.pct(drawdown.pct, 1)} from peak` : undefined,
    },
    {
      key: 'odds',
      label: 'Avg odds',
      value: summary.averageOdds === null ? '—' : format.odds(summary.averageOdds),
    },
    {
      key: 'stake',
      label: 'Avg stake',
      value: summary.averageStakeCents === null ? '—' : money(summary.averageStakeCents),
    },
  ];
  // FR-P6: only once closing odds are known.
  if (clv !== null) {
    tiles.push({
      key: 'clv',
      label: 'Avg CLV',
      value: format.signedPct(clv.value, 1),
      tone: toneOf(clv.value),
      hint: `${clv.bets} ${clv.bets === 1 ? 'bet' : 'bets'} with closing odds`,
    });
  }

  return (
    <>
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text variant="headline" accessibilityRole="header">
            Bankroll
          </Text>
          <Text variant="caption" color="inkSubtle" testID="perf-range">
            {range}
          </Text>
        </View>
        <BankrollChart
          points={data.curveCents.length > 1 ? data.curveCents : []}
          start={start}
          currency={currency}
          height={170}
          startLabel={dateLabel(data.startDay, false)}
          endLabel={active ? 'Today' : dateLabel(data.endDay!, false)}
        />
        <Text variant="caption" color="inkMuted">
          {`The dashed line is the starting budget of ${money(start)}. The shaded band marks the deepest drop.`}
        </Text>
      </View>
      <View style={s.grid}>
        {tiles.map(({ key, ...t }) => (
          <View key={key} style={s.cell}>
            <StatTile testID={`stat-${key}`} {...t} />
          </View>
        ))}
      </View>
      {summary.roi !== null && interval !== null && (
        <Text variant="caption" color="inkMuted" style={s.pad} testID="roi-range">
          {`ROI ${format.signedPct(summary.roi, 1)} (range ${format.signedPct(interval.low, 0)} to ${format.signedPct(interval.high, 0)}) over ${settled} settled bets`}
        </Text>
      )}
      <ProfitCard
        title="Profit by league"
        testID="profit-league"
        groups={data.byLeague}
        label={(k) => k}
        currency={currency}
        noun="league"
      />
      <ProfitCard
        title="Profit by market"
        testID="profit-market"
        groups={data.byMarket}
        label={(k) => MARKET_LABELS[k] ?? k}
        currency={currency}
        noun="market"
      />
      {settled < SMALL_SAMPLE_BETS && (
        <Banner tone="info" title="Small sample" testID="small-sample">
          {`${settled} settled ${settled === 1 ? 'bet is' : 'bets are'} a small sample. Results here do not show skill or luck on their own.`}
        </Banner>
      )}
      <Text variant="caption" color="inkSubtle" style={s.center}>
        Virtual money
      </Text>
    </>
  );
}

interface ProfitCardProps {
  title: string;
  testID: string;
  groups: readonly GroupProfit[];
  label: (key: string) => string;
  currency: string;
  noun: string;
}

/** FR-P4: one row per group with a bar scaled to the largest absolute profit. */
function ProfitCard({ title, testID, groups, label, currency, noun }: ProfitCardProps) {
  const theme = useTheme();
  const s = useStyles();
  const max = Math.max(0, ...groups.map((g) => Math.abs(g.profitCents)));
  return (
    <View style={s.card} testID={testID}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {groups.length === 0 ? (
        <Text color="inkMuted">No settled bets yet.</Text>
      ) : (
        groups.map((g) => {
          const up = g.profitCents >= 0;
          const amount = formatSignedMoney(g.profitCents, currency);
          const width = max === 0 ? 0 : (Math.abs(g.profitCents) / max) * 100;
          return (
            <View
              key={g.key}
              style={s.lrow}
              accessible
              accessibilityLabel={`${label(g.key)}: ${amount}, ${up ? 'up' : 'down'}, ${g.bets} ${g.bets === 1 ? 'bet' : 'bets'}`}
            >
              <Text style={s.lname} numberOfLines={2}>
                {label(g.key)}
              </Text>
              <View style={s.track}>
                <View
                  style={[
                    s.fill,
                    {
                      width: `${width}%`,
                      backgroundColor: up ? theme.colors.win : theme.colors.loss,
                    },
                  ]}
                />
              </View>
              <View style={s.amount}>
                <Icon
                  name={up ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  strokeWidth={2.25}
                  color={up ? theme.colors.win : theme.colors.loss}
                />
                <Text variant="odds" color={up ? 'win' : 'loss'} style={s.num}>
                  {amount}
                </Text>
              </View>
            </View>
          );
        })
      )}
      {groups.length > 0 && (
        <Text variant="caption" color="inkSubtle">
          {`Settled bets only. ${listing(groups.map((g) => g.bets))} ${groups.length === 1 && groups[0]!.bets === 1 ? 'bet' : 'bets'} per ${noun}.`}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space[3],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[1],
    paddingBottom: t.space[6],
  },
  chips: { flexDirection: 'row', gap: t.space[2] },
  card: { ...cardStyle(t), gap: t.space[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -t.space[3] / 2 },
  cell: { width: '50%', padding: t.space[3] / 2 },
  pad: { paddingHorizontal: t.space[1] },
  center: { textAlign: 'center' },
  lrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[3],
    minHeight: 44,
  },
  lname: { width: 104 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.pill },
  amount: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  num: { fontVariant: ['tabular-nums'] },
}));
