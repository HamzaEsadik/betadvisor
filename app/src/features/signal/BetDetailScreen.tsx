/** Bet detail (design 12): FR-A8. Frozen values come from the database, context from the feed. */
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useFeed, useFeedStore } from '@/src/api/FeedProvider';
import type { Signal } from '@/src/api/schemas';
import { dayKeyOf, daySlots, type DaySlot } from '@/src/domain/day';
import { formatMoney } from '@/src/domain/money';
import { referenceNow } from '@/src/domain/stakes';
import type { Selection } from '@/src/domain/types';
import { useTheme } from '@/src/theme';
import {
  AppBar,
  Banner,
  EdgeBadge,
  FormStrip,
  ProbabilityBar,
  Screen,
  StatTile,
  StatusPill,
  TeamBadge,
  Text,
  format,
} from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { localTime, relativeDay } from '../time';
import { SKIP_LABELS } from '../today/model';
import { useDayView, useSessionSnapshot } from '../today/useDay';

export function pickText(selection: Selection, home: string, away: string): string {
  if (selection === 'DRAW') return 'Draw';
  return `${selection === 'HOME' ? home : away} to win`;
}

/** The edge formula with the numbers filled in (`0.52 × 2.10 − 1 = +9.2%`). */
export function edgeFormula(model: number, odds: number, edge: number): string {
  return `${model.toFixed(2)} × ${format.odds(odds)} − 1 = ${format.signedPct(edge)}`;
}

export function availabilityText(signal: Signal, side: 'home' | 'away'): string {
  if (signal.context.availability_status === 'unknown') return 'Unknown, source unavailable';
  const list = side === 'home' ? signal.context.injuries_home : signal.context.injuries_away;
  return list.length === 0 ? 'None reported' : list.join(', ');
}

export function BetDetailScreen({ signalId }: { signalId: string }) {
  const theme = useTheme();
  const s = useStyles();
  const router = useRouter();
  const { currency, offsetOf } = useAppEnv();
  const feed = useFeed();
  const store = useFeedStore();
  const snapshot = useSessionSnapshot();

  const signal = feed.signals?.signals.find((x) => x.signal_id === signalId);
  const bet = snapshot?.bets.find((b) => b.signalId === signalId);
  const slots = daySlots(referenceNow(store.clock()), offsetOf);
  const kickoffAt = bet?.kickoffAt ?? signal?.kickoff_at;
  const dayKey = kickoffAt === undefined ? undefined : dayKeyOf(kickoffAt, offsetOf);
  const slot = (Object.keys(slots) as DaySlot[]).find((k) => slots[k] === dayKey);
  const view = useDayView(slot ?? 'today', snapshot);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (kickoffAt === undefined) {
    return (
      <Screen testID="screen-signal" edges={['top', 'bottom']}>
        <AppBar title="Bet detail" onBack={back} />
        <View style={s.body}>
          <Banner tone="warn" title="Not found">
            This match is no longer in the feed.
          </Banner>
        </View>
      </Screen>
    );
  }

  const home = bet?.homeTeam ?? signal!.home_team;
  const away = bet?.awayTeam ?? signal!.away_team;
  const league = bet?.league ?? signal!.league;
  const selection = bet?.selection ?? signal!.selection;
  const odds = bet?.odds ?? signal!.odds;
  const model = bet?.modelProb ?? signal!.model_prob;
  const implied = bet?.impliedProb ?? signal!.implied_prob;
  const edge = bet?.edge ?? signal!.edge;
  const time = (iso: string) => localTime(iso, offsetOf);

  const card = slot !== undefined ? view?.cards.find((c) => c.signalId === signalId) : undefined;
  const skip = slot !== undefined ? view?.skipped.find((k) => k.signalId === signalId) : undefined;
  const stakeCents = bet?.stakeCents ?? (card && !card.expired ? card.stakeCents : undefined);
  const base = bet?.bankrollBeforeCents ?? view?.baseBankrollCents;
  const stakeHint =
    stakeCents !== undefined && base !== undefined && base > 0
      ? `${((stakeCents / base) * 100).toFixed(1)}% of bankroll`
      : skip
        ? SKIP_LABELS[skip.reason]
        : card?.expired
          ? 'Kickoff passed'
          : undefined;
  const oddsHint = bet
    ? `Frozen ${time(bet.createdAt)}`
    : signal
      ? `Snapshot ${time(signal.odds_fetched_at)}`
      : undefined;
  const newer = bet && signal && signal.version > bet.signalVersion ? signal.version : null;

  return (
    <Screen testID="screen-signal" edges={['top', 'bottom']}>
      <AppBar
        title={league}
        subtitle={`${relativeDay(kickoffAt, slots.today, offsetOf)} · ${time(kickoffAt)}`}
        onBack={back}
      />
      <ScrollView contentContainerStyle={s.body}>
        <View style={[cardStyle(theme), s.card, s.gapLg]}>
          <View style={s.teams}>
            <Team name={home} code={signal?.home_code} side="Home" />
            <Text variant="titleMd" color="inkSubtle">
              v
            </Text>
            <Team name={away} code={signal?.away_code} side="Away" />
          </View>
          <View style={s.pick}>
            <Text variant="overline" color="inkSubtle">
              Pick
            </Text>
            <Text variant="titleMd" testID="pick">
              {pickText(selection, home, away)}
            </Text>
            <EdgeBadge edge={edge} />
          </View>
        </View>
        <View style={s.tiles}>
          <View style={s.tile}>
            <StatTile label="Odds" value={format.odds(odds)} hint={oddsHint} />
          </View>
          <View style={s.tile}>
            <StatTile
              testID="stake-tile"
              label="Stake"
              value={stakeCents === undefined ? '—' : formatMoney(stakeCents, currency)}
              hint={stakeHint}
            />
          </View>
        </View>
        <View style={[cardStyle(theme), s.card]}>
          <Text variant="headline" accessibilityRole="header">
            Model vs bookmaker
          </Text>
          <ProbabilityBar model={model} book={implied} />
          <Text variant="caption" color="inkMuted" testID="edge-formula">
            {`Edge is model probability × odds − 1: ${edgeFormula(model, odds, edge)}. The bookmaker figure has the margin removed.`}
          </Text>
        </View>
        {signal ? (
          <>
            <View style={[cardStyle(theme), s.card]}>
              <Text variant="headline" accessibilityRole="header">
                Recent form
              </Text>
              <Line label={home}>
                <FormStrip form={signal.context.home_form} label={home} />
              </Line>
              <Line label={away}>
                <FormStrip form={signal.context.away_form} label={away} />
              </Line>
              <Text variant="caption" color="inkSubtle">
                Last five results, newest on the right.
              </Text>
            </View>
            <View style={[cardStyle(theme), s.card]}>
              <Text variant="headline" accessibilityRole="header">
                Availability
              </Text>
              <Line label={home}>
                <Text color="inkMuted" style={s.right} testID="availability-home">
                  {availabilityText(signal, 'home')}
                </Text>
              </Line>
              <Line label={away}>
                <Text color="inkMuted" style={s.right} testID="availability-away">
                  {availabilityText(signal, 'away')}
                </Text>
              </Line>
              <View style={[s.line, s.divider]}>
                <Text>Lineup</Text>
                <StatusPill
                  status={signal.context.lineup_confirmed ? 'won' : 'open'}
                  label={signal.context.lineup_confirmed ? 'Confirmed' : 'Not confirmed'}
                />
              </View>
            </View>
            <View style={[cardStyle(theme), s.card]}>
              <Text variant="headline" accessibilityRole="header">
                Why this pick
              </Text>
              <Text testID="why">{signal.context.summary}</Text>
            </View>
          </>
        ) : (
          <Banner tone="neutral" title="No match context">
            Form, availability and the explanation are no longer in the feed.
          </Banner>
        )}
        {bet ? (
          <Banner tone="neutral" title="Frozen" testID="lock-note">
            {`Locked when you followed advice at ${time(bet.createdAt)}. Odds, probability and stake never change.` +
              (newer !== null
                ? ` The feed now has version ${newer}; this bet keeps version ${bet.signalVersion}.`
                : '')}
          </Banner>
        ) : (
          <Banner tone="neutral" title="Not frozen yet" testID="lock-note">
            Odds, probability and stake lock when you follow advice. After that they never change.
          </Banner>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space[3],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[1],
    paddingBottom: t.space[6],
  },
  card: { gap: t.space[3] },
  gapLg: { gap: t.space[4] },
  teams: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  team: { alignItems: 'center', gap: t.space[2], width: 110 },
  pick: {
    alignItems: 'center',
    gap: t.space[2],
    paddingTop: t.space[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  },
  tiles: { flexDirection: 'row', gap: t.space[3] },
  tile: { flex: 1, minWidth: 0 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space[3],
  },
  top: { alignItems: 'flex-start' },
  right: { flexShrink: 1, textAlign: 'right' },
  // "Paris Saint-Germain" does not fit the 110 dp column on one line: wrap, centred.
  teamName: { textAlign: 'center' },
  divider: { paddingTop: t.space[3], borderTopWidth: 1, borderTopColor: t.colors.line },
}));

function Team({ name, code, side }: { name: string; code?: string; side: string }) {
  const s = useStyles();
  return (
    <View style={s.team}>
      <TeamBadge name={name} code={code} size="md" />
      <Text variant="headline" numberOfLines={2} style={s.teamName}>
        {name}
      </Text>
      <Text variant="caption" color="inkMuted">
        {side}
      </Text>
    </View>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={[s.line, s.top]}>
      <Text>{label}</Text>
      {children}
    </View>
  );
}
