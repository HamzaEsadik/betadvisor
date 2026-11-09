import { View } from 'react-native';

import { formatMoney, formatSignedMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import { signedPct } from './format';
import { Icon } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface BankrollHeroProps {
  label?: string;
  /** Integer cents. */
  bankroll: number;
  /** Integer cents (bankroll minus starting budget). */
  profit: number;
  /** Ratio, 0.072 = 7.2%. */
  profitPct: number;
  openBets: number;
  /** Starting budget, integer cents. */
  start: number;
  currency?: string;
}

/** `.ba-hero`: the bankroll headline on Today. */
export function BankrollHero(p: BankrollHeroProps) {
  const theme = useTheme();
  const s = useStyles();
  const up = p.profit >= 0;
  const bankroll = formatMoney(p.bankroll, p.currency);
  const delta = `${formatSignedMoney(p.profit, p.currency)} (${signedPct(p.profitPct)})`;
  const meta = `${p.openBets} open · started with ${formatMoney(p.start, p.currency)}`;
  const tone = up ? theme.colors.win : theme.colors.loss;
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${p.label ?? 'Bankroll'} ${bankroll}, ${up ? 'up' : 'down'} ${delta}. ${p.openBets} open bets, started with ${formatMoney(p.start, p.currency)}`}
      style={s.hero}
    >
      <Text variant="overline" color="onHero" style={s.label}>
        {p.label ?? 'Bankroll'}
      </Text>
      <Text
        variant="bankrollXl"
        color="onHero"
        style={s.num}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {bankroll}
      </Text>
      <View style={s.row}>
        <View style={s.delta}>
          <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} strokeWidth={2.25} color={tone} />
          <Text variant="caption" style={[s.num, { color: tone }]}>
            {delta}
          </Text>
        </View>
        <Text variant="caption" color="onHero">
          {meta}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hero: {
    gap: t.space[2],
    paddingTop: t.space[5],
    paddingHorizontal: t.space[5],
    paddingBottom: t.space[4],
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.hero,
  },
  label: { opacity: 0.85 },
  num: { fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: t.space[3],
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[1],
    paddingVertical: 3,
    paddingLeft: t.space[2],
    paddingRight: t.space[3],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.bg,
  },
}));
