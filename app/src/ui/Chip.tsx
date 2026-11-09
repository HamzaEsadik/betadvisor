import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { hitSlopFor, makeStyles } from './styles';
import { Text } from './Text';

export interface ChipProps {
  children: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

const HEIGHT = 40;

/** `.ba-chip`: a pill toggle (day chips, filters, budget presets). */
export function Chip({
  children,
  selected = false,
  count,
  onPress,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const s = useStyles();
  const ink = selected ? theme.colors.onBrand : theme.colors.ink;
  const label = accessibilityLabel ?? (count !== undefined ? `${children}, ${count}` : children);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={hitSlopFor(HEIGHT)}
      style={[s.chip, selected && s.selected]}
    >
      <View style={s.content}>
        <Text variant="caption" style={{ color: ink }}>
          {children}
        </Text>
        {count !== undefined && (
          <Text variant="caption" style={[s.count, { color: ink }]}>
            {count}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  chip: {
    minHeight: HEIGHT,
    paddingHorizontal: t.space[4],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
    justifyContent: 'center',
  },
  selected: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  content: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
  count: { opacity: 0.8 },
}));
