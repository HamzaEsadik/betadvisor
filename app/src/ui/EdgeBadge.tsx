import { View } from 'react-native';

import { fonts, useTheme } from '@/src/theme';
import { Icon } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface EdgeBadgeProps {
  /** Edge as a ratio (0.092 = 9.2%). */
  edge: number;
}

export function edgeText(edge: number): string {
  return `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}% edge`;
}

/** `.ba-edge`: the brand-filled edge pill on a signal card. */
export function EdgeBadge({ edge }: EdgeBadgeProps) {
  const theme = useTheme();
  const s = useStyles();
  const text = edgeText(edge);
  return (
    <View accessible accessibilityLabel={text} style={s.badge}>
      <Icon name="trending-up" size={14} strokeWidth={2} color={theme.colors.onBrand} />
      <Text variant="caption" color="onBrand" style={s.text}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[1],
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: t.space[2],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.brand,
  },
  text: { fontFamily: fonts.sans700, fontVariant: ['tabular-nums'] },
}));
