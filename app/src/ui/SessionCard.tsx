import { View } from 'react-native';

import { formatMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import { Button } from './Button';
import { signedPct } from './format';
import { Icon } from './Icon';
import { Pill } from './StatusPill';
import { cardStyle, makeStyles } from './styles';
import { Text } from './Text';

export interface SessionCardProps {
  title: string;
  status: 'active' | 'closed';
  /** Display range, e.g. `"3 Nov – today"`. */
  dates: string;
  /** Integer cents. */
  startBudget: number;
  /** Current bankroll (active) or final bankroll (closed), integer cents. */
  finalBankroll: number;
  /** Ratio; null when no bet has settled. */
  roi: number | null;
  bets: number;
  currency?: string;
  onReset?: () => void;
  testID?: string;
}

/** `.ba-session`: an active or closed budget session. */
export function SessionCard(p: SessionCardProps) {
  const theme = useTheme();
  const s = useStyles();
  const active = p.status === 'active';
  const start = formatMoney(p.startBudget, p.currency);
  const final = formatMoney(p.finalBankroll, p.currency);
  const up = p.roi !== null && p.roi >= 0;
  const roi = p.roi === null ? '—' : signedPct(p.roi);
  const roiColor = p.roi === null ? 'inkMuted' : up ? 'win' : 'loss';
  return (
    <View testID={p.testID} style={[s.card, active && s.active]}>
      <View
        accessible
        accessibilityLabel={`${p.title}, ${active ? 'active' : 'closed'}, ${p.dates}. Start ${start}, ${active ? 'bankroll' : 'final'} ${final}, ROI ${roi}, ${p.bets} bets`}
        style={s.inner}
      >
        <View style={s.head}>
          <View style={s.titleBox}>
            <Text variant="headline">{p.title}</Text>
            <Text variant="caption" color="inkMuted">
              {p.dates}
            </Text>
          </View>
          {active ? <Pill icon="clock">Active</Pill> : <Pill>Closed</Pill>}
        </View>
        <View style={s.stats}>
          <View style={s.stat}>
            <Text variant="overline" color="inkSubtle">
              Start
            </Text>
            <Text variant="odds" style={s.num} adjustsFontSizeToFit numberOfLines={1}>
              {start}
            </Text>
          </View>
          <View style={s.stat}>
            <Text variant="overline" color="inkSubtle">
              {active ? 'Bankroll' : 'Final'}
            </Text>
            <Text variant="odds" style={s.num} adjustsFontSizeToFit numberOfLines={1}>
              {final}
            </Text>
          </View>
          <View style={s.stat}>
            <Text variant="overline" color="inkSubtle">
              ROI
            </Text>
            <View style={s.roi}>
              {p.roi !== null && (
                <Icon
                  name={up ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  strokeWidth={2.25}
                  color={theme.colors[roiColor]}
                />
              )}
              <Text
                variant="odds"
                color={roiColor}
                style={s.num}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {roi}
              </Text>
            </View>
          </View>
          <View style={s.stat}>
            <Text variant="overline" color="inkSubtle">
              Bets
            </Text>
            <Text variant="odds" style={s.num}>
              {String(p.bets)}
            </Text>
          </View>
        </View>
      </View>
      {active && p.onReset !== undefined && (
        <Button variant="secondary" icon="rotate-ccw" full onPress={p.onReset}>
          Reset budget
        </Button>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { ...cardStyle(t), gap: t.space[4] },
  active: { borderColor: t.colors.lineStrong },
  inner: { gap: t.space[4] },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space[3],
  },
  titleBox: { flex: 1 },
  stats: { flexDirection: 'row', gap: t.space[2] },
  stat: { flex: 1, gap: 2, minWidth: 0 },
  roi: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  num: { fontVariant: ['tabular-nums'] },
}));
