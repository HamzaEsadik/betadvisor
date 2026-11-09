import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon } from './Icon';
import { Pill } from './StatusPill';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface SkipRowProps {
  home: string;
  away: string;
  league: string;
  kickoff: string;
  /** Short reason, e.g. `"No edge"` or `"Cap reached"`. */
  reason: string;
  onPress?: () => void;
  testID?: string;
}

/** `.ba-skip`: a match the advice skipped, with its reason. */
export function SkipRow({ home, away, league, kickoff, reason, onPress, testID }: SkipRowProps) {
  const theme = useTheme();
  const s = useStyles();
  const a11y = `${home} v ${away}, ${league}, ${kickoff}. Skipped: ${reason}`;
  const body = (
    <>
      <View style={s.main}>
        <Text variant="bodyStrong" numberOfLines={1}>{`${home} v ${away}`}</Text>
        <Text variant="caption" color="inkMuted" numberOfLines={1}>
          {`${league} · ${kickoff}`}
        </Text>
      </View>
      <Pill>{reason}</Pill>
      {onPress !== undefined && (
        <Icon name="chevron-right" size={18} color={theme.colors.inkSubtle} />
      )}
    </>
  );
  if (onPress === undefined) {
    return (
      <View testID={testID} accessible accessibilityLabel={a11y} style={s.row}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[3],
    minHeight: t.sizes.tapMin,
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  main: { flex: 1, minWidth: 0 },
}));
