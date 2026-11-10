/** Today (designs 02, 03, 09, 10, 11): FR-A1 to FR-A10, FR-B1, §9.1. */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useFeed, useFeedStore } from '@/src/api/FeedProvider';
import { followAdvice } from '@/src/db/services';
import type { DaySlot } from '@/src/domain/day';
import { formatMoney } from '@/src/domain/money';
import { referenceNow } from '@/src/domain/stakes';
import { useTheme } from '@/src/theme';
import {
  AppBar,
  BankrollHero,
  Banner,
  Button,
  Chip,
  Icon,
  Screen,
  SignalCard,
  SkipRow,
  Text,
} from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { Toast } from '../common/Toast';
import { usePrefs } from '../settings/usePrefs';
import { hoursBetween, localTime, relativeDay } from '../time';
import { SKIP_LABELS, type DayView } from './model';
import { useDayView, useMinuteTick, useSessionSnapshot } from './useDay';

const CHIPS: { slot: DaySlot; label: string }[] = [
  { slot: 'yesterday', label: 'Yesterday' },
  { slot: 'today', label: 'Today' },
  { slot: 'tomorrow', label: 'Tomorrow' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function signalHref(signalId: string) {
  return { pathname: '/signal/[id]' as const, params: { id: signalId } };
}

export function TodayScreen() {
  const theme = useTheme();
  const s = useStyles();
  const router = useRouter();
  const env = useAppEnv();
  const { db, currency, offsetOf, invalidate } = env;
  const feed = useFeed();
  const store = useFeedStore();
  const [slot, setSlot] = useState<DaySlot>('today');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);
  // FR-B5: recommended bets the user left out (all are included by default).
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [prefs] = usePrefs();
  useMinuteTick();

  const snapshot = useSessionSnapshot();
  const view = useDayView(slot, snapshot);
  if (!snapshot || !view) return null;

  const { session, bankrollCents, openBets, openStakeCents } = snapshot;
  const start = session.startingBudgetCents;
  const profit = bankrollCents + openStakeCents - start;
  const money = (c: number) => formatMoney(c, currency);
  const time = (iso: string) => localTime(iso, offsetOf);

  const choosing = prefs.chooseIndividually && slot === 'today' && view.followBlock === null;
  const selectable = view.cards.filter((c) => !c.frozen && !c.expired);
  const chosen = selectable.filter((c) => !excluded.has(c.signalId));
  const selection = choosing
    ? { count: chosen.length, stakeCents: chosen.reduce((t, c) => t + c.stakeCents, 0) }
    : null;
  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const follow = () => {
    if (!feed.signals) return;
    try {
      const only = choosing ? new Set(chosen.map((c) => c.signalId)) : undefined;
      const out = followAdvice(db, feed.signals.signals, store.clock(), offsetOf, { only });
      setExcluded(new Set());
      const total = out.frozen.reduce((t, b) => t + b.stakeCents, 0);
      setError(null);
      setToast(
        out.frozen.length === 0
          ? 'Nothing new to follow.'
          : `Followed ${plural(out.frozen.length, 'bet')} · ${money(total)} frozen`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    invalidate();
  };

  const refresh = () => {
    void store.refresh();
  };

  const generatedAt = feed.generatedAt;
  const hoursOld =
    generatedAt === null ? 0 : hoursBetween(generatedAt, referenceNow(store.clock()));
  const updated =
    generatedAt === null
      ? null
      : `${relativeDay(generatedAt, view.today, offsetOf)} ${time(generatedAt)}`;
  const modelVersion = feed.meta?.model_version ?? feed.signals?.model_version;

  return (
    <Screen testID="screen-today">
      <AppBar
        title="Today"
        large
        subtitle={
          view.frozenCount > 0 && slot === 'today'
            ? `Available ${money(bankrollCents)} · ${openBets} open`
            : undefined
        }
        actions={[
          {
            icon: 'bell',
            label: 'Daily reminder',
            onPress: () => router.push('/more/settings'),
          },
        ]}
      />
      <ScrollView
        testID="today-scroll"
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefreshing}
            onRefresh={refresh}
            colors={[theme.colors.brand]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        <BankrollHero
          label="Available bankroll"
          bankroll={bankrollCents}
          profit={profit}
          profitPct={start === 0 ? 0 : profit / start}
          openBets={openBets}
          start={start}
          currency={currency}
        />
        {view.depleted ? (
          <Banner tone="warn" title="Bankroll depleted" testID="banner-depleted">
            {`Bankroll depleted. Start a new session? Every stake would now fall below the ${money(view.settings.minStakeCents)} minimum, so no bets can be followed.`}
          </Banner>
        ) : (
          <View style={s.chips} accessibilityRole="tablist">
            {CHIPS.map((c) => (
              <Chip key={c.slot} selected={slot === c.slot} onPress={() => setSlot(c.slot)}>
                {c.label}
              </Chip>
            ))}
          </View>
        )}
        {feedBanners()}
        {error !== null && (
          <Banner tone="warn" title="Could not follow advice">
            {error}
          </Banner>
        )}
        {dayContent()}
        <View style={s.meta}>
          {updated !== null && (
            <Text variant="caption" color="inkSubtle" testID="updated-footer">
              {`Updated ${updated}${modelVersion ? ` · model ${modelVersion}` : ''}`}
            </Text>
          )}
          <Text variant="caption" color="inkSubtle" style={s.center}>
            Virtual money. Results do not predict real outcomes.
          </Text>
        </View>
      </ScrollView>
      <Footer
        view={view}
        currency={currency}
        stale={feed.isStale ? updated : null}
        selection={selection}
        onFollow={follow}
        onReset={() => router.push({ pathname: '/sessions', params: { reset: '1' } })}
      />
      <Toast message={toast} onHide={hideToast} />
    </Screen>
  );

  function feedBanners() {
    const onRefresh = refresh;
    return (
      <>
        {feed.updateRequired && (
          <Banner tone="warn" title="Update required">
            This app version is too old for the current feed. Install the latest version.
          </Banner>
        )}
        {feed.isStale && (
          <Banner tone="warn" action="Refresh" onAction={onRefresh} testID="banner-stale">
            {`Data is ${hoursOld} hours old. Stakes may not match current odds.`}
          </Banner>
        )}
        {feed.isOffline && (
          <Banner tone="neutral" title="Offline" action="Retry" onAction={onRefresh}>
            Showing the last saved data.
          </Banner>
        )}
        {feed.meta?.notice != null && <Banner tone="info">{feed.meta.notice}</Banner>}
      </>
    );
  }

  function dayContent() {
    if (!view) return null;
    const onOpen = (id: string) => router.push(signalHref(id));
    const dayWord = CHIPS.find((c) => c.slot === view.slot)!.label.toLowerCase();
    const title =
      view.slot === 'yesterday' ? 'Followed' : view.slot === 'tomorrow' ? 'Preview' : 'Recommended';
    const live = view.frozenCount + view.toFollowCount;
    const pct =
      view.baseBankrollCents > 0
        ? ((view.totalStakeCents / view.baseBankrollCents) * 100).toFixed(1)
        : '0.0';
    return (
      <>
        {view.cards.length > 0 ? (
          <>
            <View style={s.section}>
              <Text variant="headline" accessibilityRole="header">
                {title}
              </Text>
              <Text variant="caption" color="inkSubtle" testID="recommended-summary">
                {`${plural(live, 'bet')} · ${pct}% of bankroll`}
              </Text>
            </View>
            {view.cards.map((c) => (
              <View key={c.signalId} style={s.cardWrap}>
                <SignalCard
                  testID={`card-${c.signalId}`}
                  home={c.home}
                  away={c.away}
                  homeCode={c.homeCode}
                  awayCode={c.awayCode}
                  league={c.league}
                  kickoff={time(c.kickoffAt)}
                  selection={c.selection}
                  odds={c.odds}
                  stake={c.stakeCents}
                  model={c.model}
                  implied={c.implied}
                  edge={c.edge}
                  currency={currency}
                  frozen={c.frozen}
                  expired={c.expired}
                  onPress={() => onOpen(c.signalId)}
                />
                {choosing && !c.frozen && !c.expired && (
                  <IncludeToggle
                    testID={`include-${c.signalId}`}
                    label={`${c.home} v ${c.away}`}
                    checked={!excluded.has(c.signalId)}
                    onPress={() => toggle(c.signalId)}
                  />
                )}
              </View>
            ))}
          </>
        ) : view.depleted && view.slot === 'today' ? null : (
          emptyState(dayWord)
        )}
        {view.skipped.length > 0 && (
          <>
            <View style={[s.section, s.sectionGap]}>
              <Text variant="headline" accessibilityRole="header">
                {`Skipped ${dayWord}`}
              </Text>
              <Text variant="caption" color="inkSubtle">
                {`${view.skipped.length} ${view.skipped.length === 1 ? 'match' : 'matches'}`}
              </Text>
            </View>
            {view.skipped.map((k) => (
              <SkipRow
                key={k.signalId}
                testID={`skip-${k.signalId}`}
                home={k.home}
                away={k.away}
                league={k.league}
                kickoff={time(k.kickoffAt)}
                reason={SKIP_LABELS[k.reason]}
                onPress={() => onOpen(k.signalId)}
              />
            ))}
          </>
        )}
      </>
    );
  }

  function emptyState(dayWord: string) {
    if (!view) return null;
    const noFeed = feed.signals === null;
    const heading = noFeed
      ? 'No data yet'
      : view.slot === 'yesterday'
        ? 'No bets followed yesterday'
        : `No recommended bets ${dayWord}`;
    const body = noFeed
      ? feed.isRefreshing
        ? 'Loading the latest advice.'
        : 'Pull down to load the latest advice.'
      : view.slot === 'yesterday'
        ? 'Nothing was frozen for this day.'
        : `The model found no edge in ${dayWord}'s matches. Skipping is part of the strategy.`;
    return (
      <View style={[cardStyle(theme), s.empty]} testID="empty-state">
        <View style={s.emptyIcon}>
          <Icon name="calendar-days" size={28} color={theme.colors.brandInk} />
        </View>
        <Text variant="headline" accessibilityRole="header" style={s.center}>
          {heading}
        </Text>
        <Text color="inkMuted" style={s.center}>
          {body}
        </Text>
      </View>
    );
  }
}

/** FR-B5: includes or leaves out one recommended bet when following. */
function IncludeToggle(p: {
  label: string;
  checked: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <Pressable
      testID={p.testID}
      accessibilityRole="checkbox"
      accessibilityLabel={`Include ${p.label}`}
      accessibilityState={{ checked: p.checked }}
      onPress={p.onPress}
      style={s.include}
    >
      <View style={[s.box, p.checked && s.boxOn]}>
        {p.checked && <Icon name="check" size={16} color={theme.colors.onBrand} />}
      </View>
      <Text variant="caption" color="inkMuted">
        {p.checked ? 'Included in Follow advice' : 'Left out'}
      </Text>
    </Pressable>
  );
}

interface FooterProps {
  view: DayView;
  currency: string;
  /** "Updated …" text when the data is stale. */
  stale: string | null;
  /** FR-B5: the chosen bets, when choosing individually. */
  selection: { count: number; stakeCents: number } | null;
  onFollow: () => void;
  onReset: () => void;
}

function Footer({ view, currency, stale, selection, onFollow, onReset }: FooterProps) {
  const s = useStyles();
  if (view.slot === 'today' && view.depleted) {
    return (
      <View style={s.footer}>
        <Button full icon="rotate-ccw" onPress={onReset} testID="reset-budget">
          Reset budget
        </Button>
      </View>
    );
  }
  if (view.slot !== 'today') {
    if (view.slot === 'yesterday' || view.cards.length === 0) return null;
    return (
      <View style={s.footer}>
        <Text variant="caption" color="inkMuted" style={s.center}>
          Preview. Stakes are set from the bankroll when the day starts.
        </Text>
      </View>
    );
  }
  if (view.toFollowCount === 0) {
    if (view.frozenCount === 0) return null;
    return (
      <View style={s.footer}>
        <Text variant="caption" color="inkMuted" style={s.center} testID="footer-summary">
          {`${plural(view.frozenCount, 'bet')} followed · stakes frozen`}
        </Text>
      </View>
    );
  }
  const caption =
    (selection === null
      ? `${plural(view.toFollowCount, 'bet')} · ${formatMoney(view.toFollowStakeCents, currency)} total stake`
      : `${selection.count} of ${plural(view.toFollowCount, 'bet')} · ${formatMoney(selection.stakeCents, currency)} total stake`) +
    (stale !== null ? ` · Updated ${stale.charAt(0).toLowerCase()}${stale.slice(1)}` : '');
  return (
    <View style={s.footer}>
      <Text variant="caption" color="inkMuted" style={s.center} testID="footer-summary">
        {caption}
      </Text>
      <Button
        full
        icon="check"
        disabled={view.followBlock !== null || selection?.count === 0}
        onPress={onFollow}
        testID="follow-advice"
        accessibilityLabel={
          view.followBlock === 'stale'
            ? 'Follow advice, disabled: data is stale'
            : selection === null
              ? 'Follow advice'
              : `Follow ${selection.count} selected`
        }
      >
        {selection === null ? 'Follow advice' : `Follow ${selection.count} selected`}
      </Button>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space[3],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[1],
    paddingBottom: 96,
  },
  chips: { flexDirection: 'row', gap: t.space[2] },
  cardWrap: { gap: t.space[2] },
  include: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[3],
    minHeight: 48,
    paddingHorizontal: t.space[2],
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: t.radius.sm,
    borderWidth: 2,
    borderColor: t.colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: t.space[1],
  },
  sectionGap: { marginTop: t.space[3] },
  empty: {
    alignItems: 'center',
    gap: t.space[3],
    paddingVertical: 40,
    paddingHorizontal: t.space[6],
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { alignItems: 'center', gap: 2, paddingTop: t.space[2] },
  center: { textAlign: 'center' },
  footer: {
    gap: t.space[2],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[2],
    paddingBottom: t.space[3],
    backgroundColor: t.colors.bg,
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  },
}));
