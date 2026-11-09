import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { formatMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import { EdgeBadge, edgeText } from './EdgeBadge';
import { odds as fmtOdds } from './format';
import { Icon } from './Icon';
import { ProbabilityBar } from './ProbabilityBar';
import { cardStyle, makeStyles } from './styles';
import { TeamBadge } from './TeamBadge';
import { Text } from './Text';

export type Selection = 'HOME' | 'DRAW' | 'AWAY';

export interface SignalCardProps {
  home: string;
  away: string;
  homeCode?: string;
  awayCode?: string;
  league: string;
  /** Display string, e.g. `"Sat 15:00"`. */
  kickoff: string;
  selection: Selection;
  odds: number;
  /** Stake in integer cents. */
  stake: number;
  /** Model probability of the selection. */
  model: number;
  /** Bookmaker implied probability of the selection. */
  implied: number;
  edge: number;
  currency?: string;
  frozen?: boolean;
  expired?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function selectionName(selection: Selection, home: string, away: string): string {
  return selection === 'HOME' ? home : selection === 'AWAY' ? away : 'Draw';
}

/** `.ba-signal`: a recommended bet with pick, odds, stake and model vs book. */
export function SignalCard(p: SignalCardProps) {
  const theme = useTheme();
  const s = useStyles();
  const pick = selectionName(p.selection, p.home, p.away);
  const stake = formatMoney(p.stake, p.currency);
  const state = p.expired ? 'kickoff passed' : p.frozen ? 'frozen' : edgeText(p.edge);
  const a11y = `${p.home} v ${p.away}, ${p.league}, ${p.kickoff}. Pick ${pick} at ${fmtOdds(p.odds)}, stake ${stake}, ${state}`;

  let status: ReactNode;
  if (p.expired) {
    status = (
      <Text variant="caption" color="inkSubtle">
        Kickoff passed
      </Text>
    );
  } else if (p.frozen) {
    status = (
      <View style={s.frozen}>
        <Icon name="lock" size={14} color={theme.colors.inkMuted} />
        <Text variant="caption" color="inkMuted">
          Frozen
        </Text>
      </View>
    );
  } else {
    status = <EdgeBadge edge={p.edge} />;
  }

  const body = (
    <>
      <View style={s.head}>
        <Text variant="caption" color="inkMuted" style={s.shrink} numberOfLines={1}>
          {`${p.league} · ${p.kickoff}`}
        </Text>
        {status}
      </View>
      <View style={s.body}>
        <View style={s.teams}>
          <View style={s.teamRow}>
            <TeamBadge name={p.home} code={p.homeCode} />
            <Text variant="headline" style={s.shrink} numberOfLines={1}>
              {p.home}
            </Text>
          </View>
          <View style={s.teamRow}>
            <TeamBadge name={p.away} code={p.awayCode} />
            <Text variant="headline" style={s.shrink} numberOfLines={1}>
              {p.away}
            </Text>
          </View>
        </View>
        <View style={s.pick}>
          <Text variant="overline" color="inkSubtle">
            Pick
          </Text>
          <Text variant="bodyStrong">{pick}</Text>
          <Text variant="odds" style={s.num}>
            {fmtOdds(p.odds)}
          </Text>
        </View>
      </View>
      <View style={s.foot}>
        <View style={s.stake}>
          <Text variant="overline" color="inkSubtle">
            Stake
          </Text>
          <Text variant="odds" color="brandInk" style={s.num}>
            {stake}
          </Text>
        </View>
        <ProbabilityBar model={p.model} book={p.implied} compact />
      </View>
    </>
  );

  const style = [s.card, p.expired && s.expired];
  if (p.onPress === undefined) {
    return (
      <View testID={p.testID} accessible accessibilityLabel={a11y} style={style}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={p.testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Opens the bet detail"
      onPress={p.onPress}
      style={({ pressed }) => [...style, pressed && s.pressed]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: { ...cardStyle(t), gap: t.space[3] },
  expired: { opacity: 0.72 },
  pressed: { borderColor: t.colors.lineStrong },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space[2],
  },
  shrink: { flexShrink: 1 },
  frozen: { flexDirection: 'row', alignItems: 'center', gap: t.space[1] },
  body: { flexDirection: 'row', alignItems: 'center', gap: t.space[4] },
  teams: { flex: 1, gap: t.space[2] },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: t.space[3] },
  pick: {
    alignItems: 'flex-end',
    gap: 2,
    paddingLeft: t.space[4],
    borderLeftWidth: 1,
    borderLeftColor: t.colors.line,
  },
  num: { fontVariant: ['tabular-nums'] },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[5],
    paddingTop: t.space[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  },
  stake: { gap: 2, minWidth: 76 },
}));
