/** Ledger (design 13): FR-L1 to FR-L3, NFR-P3 (virtualized list). */
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { repos } from '@/src/db/repos';
import { dayKeyOf } from '@/src/domain/day';
import { AppBar, Banner, Button, Chip, Icon, LedgerRow, Screen, Text } from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useTheme } from '@/src/theme';
import { useAppEnv } from '../app/AppEnv';
import { Toast } from '../common/Toast';
import { useFocusRevision } from '../common/useFocusRevision';
import { sessionNumbers } from '../sessions/model';
import { csvFileName, ledgerCsv } from './csv';
import { DateRangeSheet } from './DateRangeSheet';
import {
  applyFilter,
  groupByDay,
  leaguesOf,
  ledgerBets,
  NO_FILTER,
  pickName,
  rangeLabel,
  rowDate,
  STATUS_FILTERS,
  statusCounts,
  type LedgerFilter,
  type LedgerItem,
} from './model';
import { shareCsv } from './share';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function LedgerScreen() {
  const s = useStyles();
  const { db, now, offsetOf, currency, revision } = useAppEnv();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string }>();
  const focused = useFocusRevision();
  const [filter, setFilter] = useState<LedgerFilter>(NO_FILTER);
  const [datesOpen, setDatesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);
  const today = dayKeyOf(now(), offsetOf);

  const data = useMemo(() => {
    const r = repos(db);
    const sessions = r.sessions.list();
    const wanted = params.session === undefined ? NaN : Number(params.session);
    const session =
      sessions.find((x) => x.id === wanted) ?? sessions.find((x) => x.status === 'active');
    if (!session) return null;
    const bets = ledgerBets(
      r.bets.listBySession(session.id),
      r.bankroll.listBySession(session.id),
      offsetOf,
    );
    return { session, number: sessionNumbers(sessions).get(session.id)!, bets };
    // `revision` signals a database write; focus re-reads what changed elsewhere (settlement).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, revision, focused, params.session, offsetOf]);

  const shown = useMemo(() => (data ? applyFilter(data.bets, filter) : []), [data, filter]);
  const items = useMemo(() => groupByDay(shown, today), [shown, today]);
  if (!data) return null;
  const counts = statusCounts(data.bets, filter);
  const leagues = leaguesOf(data.bets);
  const set = (patch: Partial<LedgerFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const exportCsv = async () => {
    try {
      await shareCsv(csvFileName(data.number, today), ledgerCsv(data.bets));
      setError(null);
      setToast(`Exported ${plural(data.bets.length, 'bet')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const header = (
    <View style={s.header}>
      <ScrollView
        horizontal
        style={s.chipScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.chips, s.chipsBleed]}
      >
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.key}
            testID={`filter-${f.key}`}
            selected={filter.status === f.key}
            count={counts[f.key]}
            onPress={() => set({ status: f.key })}
          >
            {f.label}
          </Chip>
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        style={s.chipScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.chips, s.chipsBleed]}
      >
        <Chip
          testID="league-all"
          selected={filter.league === null}
          onPress={() => set({ league: null })}
        >
          All leagues
        </Chip>
        {leagues.map((l) => (
          <Chip
            key={l}
            testID={`league-${l}`}
            selected={filter.league === l}
            onPress={() => set({ league: l })}
          >
            {l}
          </Chip>
        ))}
      </ScrollView>
      <View style={s.chips}>
        <Chip
          testID="date-filter"
          selected={filter.dates.from !== null || filter.dates.to !== null}
          accessibilityLabel={`Dates: ${rangeLabel(filter.dates, today)}. Change`}
          onPress={() => setDatesOpen(true)}
        >
          {rangeLabel(filter.dates, today)}
        </Chip>
      </View>
      {data.session.status === 'closed' && (
        <Banner
          tone="info"
          action="Show active session"
          onAction={() => router.setParams({ session: undefined })}
          testID="ledger-archived"
        >
          {`Session ${data.number} is closed. Its open bets still settle for the record.`}
        </Banner>
      )}
      {error !== null && (
        <Banner tone="warn" title="Export failed">
          {error}
        </Banner>
      )}
      <View style={s.countRow}>
        <Text variant="caption" color="inkMuted" testID="ledger-count">
          {shown.length === data.bets.length
            ? `${plural(shown.length, 'bet')}, newest first`
            : `${shown.length} of ${plural(data.bets.length, 'bet')}, newest first`}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          disabled={data.bets.length === 0}
          onPress={() => void exportCsv()}
          testID="export-csv"
        >
          Export CSV
        </Button>
      </View>
    </View>
  );

  return (
    <Screen testID="screen-ledger">
      <AppBar
        title="Ledger"
        large
        subtitle={`Session ${data.number}${data.session.status === 'closed' ? ' · closed' : ''}`}
      />
      {header}
      <FlashList
        testID="ledger-list"
        data={items}
        keyExtractor={(it) => it.key}
        getItemType={(it) => it.type}
        renderItem={({ item }) => (
          <Item item={item} today={today} currency={currency} offsetOf={offsetOf} />
        )}
        ListEmptyComponent={
          <Empty
            text={
              data.bets.length === 0
                ? 'No bets in this session yet. Follow advice on Today to record bets.'
                : 'No bets match these filters.'
            }
          />
        }
        contentContainerStyle={s.list}
      />
      <DateRangeSheet
        visible={datesOpen}
        value={filter.dates}
        today={today}
        onClose={() => setDatesOpen(false)}
        onApply={(dates) => {
          set({ dates });
          setDatesOpen(false);
        }}
      />
      <Toast message={toast} onHide={hideToast} />
    </Screen>
  );
}

interface ItemProps {
  item: LedgerItem;
  today: string;
  currency: string;
  offsetOf: ReturnType<typeof useAppEnv>['offsetOf'];
}

function Item({ item, today, currency, offsetOf }: ItemProps) {
  const s = useStyles();
  if (item.type === 'header') {
    return (
      <Text
        variant="overline"
        color="inkSubtle"
        accessibilityRole="header"
        style={s.dayHeader}
        testID={item.key}
      >
        {item.title}
      </Text>
    );
  }
  const b = item.bet;
  return (
    <View style={[s.rowWrap, item.first && s.rowFirst, item.last && s.rowLast]}>
      <LedgerRow
        testID={`ledger-row-${b.id}`}
        home={b.homeTeam}
        away={b.awayTeam}
        date={rowDate(b, today, offsetOf)}
        selection={pickName(b)}
        odds={b.odds}
        stake={b.stakeCents}
        status={b.status === 'open' && b.reviewFlag ? 'review' : b.status}
        profit={b.status === 'open' ? null : b.profitCents}
        bankroll={b.bankrollAfterCents}
        currency={currency}
      />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View style={[cardStyle(theme), s.empty]} testID="ledger-empty">
      <Icon name="list-ordered" size={28} color={theme.colors.brandInk} />
      <Text color="inkMuted" style={s.center}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  list: { paddingHorizontal: t.space[4], paddingBottom: t.space[6] },
  header: { gap: t.space[3], paddingTop: t.space[1], paddingHorizontal: t.space[4] },
  // Chip rows scroll to the screen edge (they bleed through the header's side padding).
  chipScroll: { flexGrow: 0, marginHorizontal: -t.space[4] },
  chipsBleed: { paddingHorizontal: t.space[4] },
  chips: { flexDirection: 'row', gap: t.space[2] },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayHeader: { paddingTop: t.space[4], paddingBottom: t.space[2] },
  rowWrap: {
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: t.radius.lg,
    borderTopRightRadius: t.radius.lg,
  },
  // The row's own bottom line closes the card.
  rowLast: { borderBottomLeftRadius: t.radius.lg, borderBottomRightRadius: t.radius.lg },
  empty: { alignItems: 'center', gap: t.space[3], paddingVertical: 32, marginTop: t.space[3] },
  center: { textAlign: 'center' },
}));
