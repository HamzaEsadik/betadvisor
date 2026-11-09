import { View } from 'react-native';

import { formatMoney, formatSignedMoney } from '@/src/domain/money';
import { useTheme, type ColorName } from '@/src/theme';
import { odds as fmtOdds } from './format';
import { Icon, type IconName } from './Icon';
import { STATUS, StatusPill, type BetStatus } from './StatusPill';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface LedgerRowProps {
  home: string;
  away: string;
  /** Display date, e.g. `"Sat 8 Nov"`. */
  date: string;
  /** Display pick, e.g. `"Arsenal"` or `"Draw"`. */
  selection: string;
  odds: number;
  /** Integer cents. */
  stake: number;
  status: BetStatus;
  /** Integer cents; null while the bet is open. */
  profit: number | null;
  /** Bankroll after this bet, integer cents. */
  bankroll: number;
  /** Ledger bets are frozen; pass `false` to hide the lock. */
  frozen?: boolean;
  currency?: string;
  testID?: string;
}

function profitTone(status: BetStatus): { color: ColorName; icon: IconName } {
  if (status === 'won') return { color: 'win', icon: 'arrow-up' };
  if (status === 'lost') return { color: 'loss', icon: 'arrow-down' };
  return { color: 'inkMuted', icon: 'minus' };
}

/** `.ba-ledger`: one frozen bet with status, profit and running bankroll. */
export function LedgerRow(p: LedgerRowProps) {
  const theme = useTheme();
  const s = useStyles();
  const stake = formatMoney(p.stake, p.currency);
  const bankroll = formatMoney(p.bankroll, p.currency);
  const tone = profitTone(p.status);
  const profit = p.profit === null ? null : formatSignedMoney(p.profit, p.currency);
  const a11y = [
    `${p.home} v ${p.away}, ${p.date}`,
    `${p.selection} at ${fmtOdds(p.odds)}, stake ${stake}`,
    STATUS[p.status].label,
    profit === null ? 'no result yet' : `profit ${profit}`,
    `bankroll ${bankroll}`,
    p.frozen !== false ? 'frozen' : null,
  ]
    .filter((x) => x !== null)
    .join(', ');
  return (
    <View testID={p.testID} accessible accessibilityLabel={a11y} style={s.row}>
      <View style={s.main}>
        <Text variant="bodyStrong" numberOfLines={1}>{`${p.home} v ${p.away}`}</Text>
        <Text variant="caption" color="inkMuted">
          {`${p.date} · ${p.selection} @ ${fmtOdds(p.odds)} · stake ${stake}`}
        </Text>
        <View style={s.status}>
          <StatusPill status={p.status} />
          {p.frozen !== false && (
            <Icon name="lock" size={14} color={theme.colors.inkSubtle} label="Frozen" />
          )}
        </View>
      </View>
      <View style={s.nums}>
        {profit === null ? (
          <Text variant="odds" color="inkMuted">
            —
          </Text>
        ) : (
          <View style={s.profit}>
            <Icon name={tone.icon} size={16} strokeWidth={2.25} color={theme.colors[tone.color]} />
            <Text variant="odds" color={tone.color} style={s.num}>
              {profit}
            </Text>
          </View>
        )}
        <Text variant="caption" color="inkSubtle" style={s.num}>
          {`Bankroll ${bankroll}`}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: t.space[3],
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
    backgroundColor: t.colors.surface,
  },
  main: { flex: 1, gap: 2, minWidth: 0 },
  status: { flexDirection: 'row', alignItems: 'center', gap: t.space[2], paddingTop: t.space[1] },
  nums: { alignItems: 'flex-end', gap: 2 },
  profit: { flexDirection: 'row', alignItems: 'center', gap: t.space[1] },
  num: { fontVariant: ['tabular-nums'] },
}));
