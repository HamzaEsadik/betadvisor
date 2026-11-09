import { View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  /** `win` / `loss` add a color and an arrow; `flat` is neutral. */
  tone?: 'win' | 'loss' | 'flat';
  testID?: string;
}

/** `.ba-tile`: a labelled metric. */
export function StatTile({ label, value, hint, tone, testID }: StatTileProps) {
  const theme = useTheme();
  const s = useStyles();
  const color = tone === 'win' ? 'win' : tone === 'loss' ? 'loss' : 'ink';
  const direction = tone === 'win' ? ', up' : tone === 'loss' ? ', down' : '';
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}${direction}${hint !== undefined ? `. ${hint}` : ''}`}
      style={s.tile}
    >
      <Text variant="overline" color="inkSubtle">
        {label}
      </Text>
      <View style={s.valueRow}>
        {tone === 'win' && (
          <Icon name="arrow-up" size={18} strokeWidth={2.25} color={theme.colors.win} />
        )}
        {tone === 'loss' && (
          <Icon name="arrow-down" size={18} strokeWidth={2.25} color={theme.colors.loss} />
        )}
        <Text variant="stat" color={color} style={s.num}>
          {value}
        </Text>
      </View>
      {hint !== undefined && (
        <Text variant="caption" color="inkMuted">
          {hint}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    gap: t.space[1],
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.md,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: t.space[1] },
  num: { fontVariant: ['tabular-nums'] },
}));
